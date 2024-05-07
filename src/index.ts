import * as fs from "node:fs/promises";
import {FileHandle} from "node:fs/promises";
import {DeflateCRC32Stream} from "crc32-stream";
import {ExtendedStats, Options} from "./types.js";
import {getFiles} from "./files.js";
import PQueue from 'p-queue-multi';
import * as os from "node:os";

const allocateBuffer = (size: number) => {
	return Buffer.alloc(size, 0);
}

const bufferFromString = (string: string) => {
	return Buffer.from(string, 'utf8');
}

const initFileHeaderTempl = () => {
	const headerTempl = allocateBuffer(30);
	headerTempl.writeInt32LE(0x04034b50, 0); //signature
	headerTempl.writeInt16LE(20, 4 ); //extractVersion
	headerTempl.writeInt16LE(0x808, 6); //bitflag (Data Descriptor + UTF8)
	headerTempl.writeInt16LE(8, 8); //compressionType
	headerTempl.writeInt16LE(0x6020, 10); //ModTime 12:01pm
	headerTempl.writeInt16LE(0x21, 12); //ModDate 1980/1/1
	return headerTempl
}

const initFileCentralDirTempl = () => {
	const directoryHeader = allocateBuffer(46);
	directoryHeader.writeInt32LE(0x02014b50, 0); //signature
	directoryHeader.writeInt16LE(20, 6 ); //extractVersion
	directoryHeader.writeInt16LE(0x808, 8); //bitflag (Data Descriptor + UTF8)
	directoryHeader.writeInt16LE(8, 10); //compressionType
	directoryHeader.writeInt16LE(0x6020, 12); //ModTime 12:01pm
	directoryHeader.writeInt16LE(0x21, 14); //ModDate 1980/1/1
	return directoryHeader;
}

class Zipfile {
	index: number;
	zipfile: string;
	fileObjects: ExtendedStats[];
	outputStream?: FileHandle;
	fileheaderTempl: Buffer;
	fileCentralDirTempl: Buffer;
	numberOfFiles: number;
	directoryOffset: number;
	stats: {
		timeDeflating: number;
		timeReading: number;
		timeWriting: number;
	}

	constructor(files: ExtendedStats[], zipfile: string, private options: Options) {
		this.index = 0;
		files.sort((a: ExtendedStats, b: ExtendedStats) => {
			return a.relativePath.localeCompare(b.relativePath);
		});
		this.zipfile = zipfile;
		this.fileObjects = files;
		this.fileheaderTempl = initFileHeaderTempl();
		this.fileCentralDirTempl = initFileCentralDirTempl();
		this.numberOfFiles = 0;
		this.directoryOffset = 0;
		this.stats = {
			timeDeflating: 0,
			timeReading: 0,
			timeWriting: 0
		}
	}

	async #write(buffer: Buffer) {
		if (!this.outputStream) {
			this.outputStream = await fs.open(this.zipfile, 'w');
		}

		this.index += buffer.length;
		await this.outputStream.write(buffer);
	}

	#getHeaderBuffers(file: ExtendedStats) {
		const headerTempl = Buffer.from(this.fileheaderTempl);
		const filenameBuffer = bufferFromString(file.relativePath);
		headerTempl.writeInt16LE(filenameBuffer.length, 26);
		return [headerTempl, filenameBuffer]
	}

	async #writeFileHeader(fileheaderBuffers: Buffer[]) {
		for(const buffer of fileheaderBuffers) {
			await this.#write(buffer)
		}
	}

	#getDataDescriptor(file: ExtendedStats) {
		const dataDescriptor = allocateBuffer(16)
		dataDescriptor.writeInt32LE(0x08074b50, 0); //signature
		if (!file.checksum && file.size > 0) {
			throw new Error("Checksum undefined")
		}
		dataDescriptor.writeUInt32LE(Buffer.alloc(4, 0).readUIntLE(0, 4), 4); //crc-32
		dataDescriptor.writeInt32LE(file.compressedSize ?? 0, 8); //compressed size
		dataDescriptor.writeInt32LE(file.uncompressedSize ?? 0, 12); //uncompressed size
		return dataDescriptor;
	}

	async #getEntry(file: ExtendedStats): Promise<undefined> {
		return new Promise<undefined>(async (resolve, reject) => {
			if(file.isFile) {
				this.numberOfFiles++

				const readingStart = Date.now();
				const readStream = await fs.readFile(file.absolutePath);
				this.stats.timeReading += Date.now() - readingStart;

				const deflatingStart = Date.now();
				const checksum = new DeflateCRC32Stream();
				const datas: Buffer[] = []

				checksum.on('data', (data) => {
					datas.push(data)
				});
				checksum.on('end', async () => {
					this.stats.timeDeflating += Date.now() - deflatingStart;
					file.checksum = checksum.digest().readUIntBE(0, 4);
					file.uncompressedSize = checksum.size();
					file.compressedSize = checksum.size(true);


					file.data = {
						headers: this.#getHeaderBuffers(file),
						data: Buffer.concat(datas),
						footer: this.#getDataDescriptor(file),
					}
					resolve(undefined);
				})
				checksum.end(readStream);
			} else {
				return resolve(undefined);
			}
		});
	}

	async #writeDirectoryEntry(file: ExtendedStats) {
		if(!file.isDirectory) {
			const directoryTempl = Buffer.from(this.fileCentralDirTempl);
			const filenameBuffer = bufferFromString(file.relativePath)
			if (!file.checksum && file.size > 0) {
				throw new Error("Directory checksum undefined")
			}
			directoryTempl.writeUIntLE(file.checksum ?? 0, 16, 4); //crc-32
			directoryTempl.writeInt32LE(file.compressedSize ?? 0, 20); //compressedSize
			directoryTempl.writeInt32LE(file.uncompressedSize ?? 0, 24); //uncompressedSize
			directoryTempl.writeInt16LE(filenameBuffer.length, 28); //filename length
			directoryTempl.writeInt32LE(file.headerOffset ?? 0, 42);
			const buffers = [directoryTempl, filenameBuffer]
			for(const buffer of buffers) {
				await this.#write(buffer)
			}
		}
	}

	async #writeEndRecord() {
		const directorySize = this.index - this.directoryOffset;
		const endRecord = allocateBuffer(22);
		if (this.numberOfFiles <= 65536) {
			endRecord.writeInt32LE(0x06054b50, 0)
			endRecord.writeUInt16LE(this.numberOfFiles, 8); //entries on disk
			endRecord.writeUInt16LE(this.numberOfFiles, 10); //total entries
			endRecord.writeUInt32LE(directorySize, 12); //size directory
			endRecord.writeUInt32LE(this.directoryOffset, 16); //directory offset
		} else {
			// we are going to need the zip64 extension here
			endRecord.writeInt32LE(0x06054b50, 0)
			endRecord.writeUInt16LE(0xffff, 4); //number of this disk
			endRecord.writeUInt16LE(0xffff, 6); //disk where central dir starts
			endRecord.writeUInt16LE(0xffff, 8); //entries on disk
			endRecord.writeUInt16LE(0xffff, 10); //total entries
			endRecord.writeUInt32LE(0xffffffff, 12); //size directory
			endRecord.writeUInt32LE(0xffffffff, 16); //directory offset
		}
		await this.#write(endRecord);

		if (this.numberOfFiles > 65536) {
			const zip64End = allocateBuffer(56);
			zip64End.writeInt32LE(0x06064b50, 0);
			zip64End.writeUInt32LE(44, 4); //size of zip64 end of central directory record
			zip64End.writeUInt16LE(45, 12); //version made by
			zip64End.writeUInt16LE(45, 14); //version needed to extract
			zip64End.writeUInt32LE(0, 16); //number of this disk
			zip64End.writeUInt32LE(0, 20); //disk where central directory starts
			zip64End.writeUInt32LE(this.numberOfFiles, 24); //entries on disk
			zip64End.writeUInt32LE(this.numberOfFiles, 32); //total entries
			zip64End.writeUInt32LE(directorySize, 40); //size of central directory
			zip64End.writeUInt32LE(this.directoryOffset, 48); //central directory offset
			await this.#write(zip64End);
		}
	}

	async zip() {
		// not sure why using more cpu's than the system has is a good idea, but it's much faster
		const queue = new PQueue({concurrency: os.cpus().length * 2});

		const interval = setInterval(() => {
			this.options.onProgress?.(queue.size, this.fileObjects.length)
		}, 1000)

		for (const file of this.fileObjects) {
			queue.add(async () => {
				await this.#getEntry(file)
			})
		}

		// write all entries to the zip file
		await queue.onIdle();
		clearInterval(interval)

		const writingStart = Date.now();
		// write the directory entries
		for(const file of this.fileObjects) {
			if (file.data) {
				// headerOffset is later used for writing directory entries
				file.headerOffset = this.index;
				await this.#writeFileHeader(file.data.headers);
				await this.#write(file.data.data);
				await this.#write(file.data.footer);

			}
		}

		this.directoryOffset = this.index;
		for (const entry of this.fileObjects) {
			await this.#writeDirectoryEntry(entry);
		}
		await this.#writeEndRecord();
		if (!this.outputStream) {
			throw new Error("Output stream not initialized")
		}
		await this.outputStream.close()
		this.stats.timeWriting = Date.now() - writingStart;
	}
}

const zip = async (dir: string, destination: string, options: Options) => {
	options.includes = options.includes ?? ['./**']
	options.excludes = options.excludes ?? ['.git', 'CVS', '.svn', '.hg', '.lock-wscript', '.wafpickle-N', '*.swp', '.DS_Store', '._*', 'npm-debug.log']
	options.cwd = options.cwd || '.';
	const files = await getFiles(dir, options)
	const zipfile = new Zipfile(files, destination, options);
	await zipfile.zip();
	return zipfile.stats;
}

export {zip}