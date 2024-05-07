export interface Options {
    includes?: string[];
    excludes?: string[];
    cwd?: string;
    onProgress?: (remaining: number, total: number) => void;
}

export type ExtendedStats = {
    isFile: boolean
    isDirectory: boolean
    size: number

    relativePath: string;
    filename: string;
    absolutePath: string;
    headerOffset?: number;
    checksum?: number;
    uncompressedSize?: number;
    compressedSize?: number;

    data?: Entry
}
export type Entry = {
    headers: Buffer[];
    data: Buffer;
    footer: Buffer
}