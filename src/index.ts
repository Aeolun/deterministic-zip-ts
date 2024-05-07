import * as fs from "node:fs/promises";
import {FileHandle} from "node:fs/promises";
import {DeflateCRC32Stream} from "crc32-stream";
import {ExtendedStats, Options} from "./types";
import {getFiles} from "./files";

const allocateBuffer = (size: number) => {
	return Buffer.alloc(size, 0);
}

const fromBuffer = (string: string) => {
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

	constructor(files: ExtendedStats[], zipfile: string) {
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
	}

	async #write(buffer: Buffer) {
		if (!this.outputStream) {
			this.outputStream = await fs.open(this.zipfile, 'w');
		}

		this.index += buffer.length;
		await this.outputStream.write(buffer);
	}

	#getHeaderBuffers(file: ExtendedStats) {
		const headerTempl = this.fileheaderTempl;
		const filenameBuffer = fromBuffer(file.relativePath);
		headerTempl.writeInt16LE(filenameBuffer.length, 26);
		return [headerTempl, filenameBuffer]
	}

	async #writeFileHeader(file: ExtendedStats) {
		const fileheaderBuffers = this.#getHeaderBuffers(file);
		for(const buffer of fileheaderBuffers) {
			await this.#write(buffer)
		}
	}

	async #writeDataDescriptor(file: ExtendedStats) {
		const dataDescriptor = allocateBuffer(16)
		dataDescriptor.writeInt32LE(0x08074b50, 0); //signature
		if (!file.checksum && file.size > 0) {
			throw new Error("Checksum undefined")
		}
		dataDescriptor.writeUIntLE(Buffer.alloc(4, 0).readUIntLE(0, 4), 4, 4); //crc-32
		dataDescriptor.writeInt32LE(file.compressedSize ?? 0, 8); //compressed size
		dataDescriptor.writeInt32LE(file.uncompressedSize ?? 0, 12); //uncompressed size
		await this.#write(dataDescriptor);
	}

	async #writeEntry(file: ExtendedStats) {

		return new Promise<boolean>(async (resolve, reject) => {
			file.headerOffset = this.index;
			if(file.isFile()) {
				this.numberOfFiles++
				await this.#writeFileHeader(file);
				const readStream = await fs.readFile(file.absolutePath);
				const checksum = new DeflateCRC32Stream();
				checksum.on('end', async () => {
					file.checksum = checksum.digest().readUIntBE(0, 4);
					file.uncompressedSize = checksum.size();
					file.compressedSize = checksum.size(true);
					this.index += checksum.size(true); //add uncompressed size to index
					try {
						await this.#writeDataDescriptor(file)
					} catch(error) {
						reject(error)
					}

					resolve(true)
				})
				if (!this.outputStream) {
					throw new Error("Output stream not initialized")
				}
				checksum.pipe(this.outputStream.createWriteStream(), {end: false});
				checksum.write(readStream)
				checksum.end();
			}
			return resolve(true);
		});
	}

	async #writeDirectoryEntry(file: ExtendedStats) {
		if(!file.isDirectory() ) {
			const directoryTempl = this.fileCentralDirTempl;
			const filenameBuffer = fromBuffer(file.relativePath)
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
		endRecord.writeInt32LE(0x06054b50, 0)
		endRecord.writeInt16LE(this.numberOfFiles, 8); //entries on disk
		endRecord.writeInt16LE(this.numberOfFiles, 10); //total entries
		endRecord.writeInt32LE(directorySize, 12); //size directory
		endRecord.writeInt32LE(this.directoryOffset, 16); //directory offset
		await this.#write(endRecord);
	}

	async zip() {
		for (const file of this.fileObjects) {
			await this.#writeEntry(file)
		}
		this.directoryOffset = this.index;
		for (const file of this.fileObjects) {
			await this.#writeDirectoryEntry(file);
		}
		await this.#writeEndRecord();
		if (!this.outputStream) {
			throw new Error("Output stream not initialized")
		}
		await this.outputStream.close()
	}
}

const zip = async (dir: string, destination: string, options: Options) => {
	options.includes = options.includes ?? ['./**']
	options.excludes = options.excludes ?? ['.git', 'CVS', '.svn', '.hg', '.lock-wscript', '.wafpickle-N', '*.swp', '.DS_Store', '._*', 'npm-debug.log']
	options.cwd = options.cwd || '.';
	const files = await getFiles(dir, options)
	const zipfile = new Zipfile(files, destination);
	await zipfile.zip();
}

export {zip}