import {Stats} from "node:fs";

export interface Options {
    includes?: string[];
    excludes?: string[];
    cwd?: string;
}

export type ExtendedStats = Stats & {
    relativePath: string;
    filename: string;
    absolutePath: string;
    headerOffset?: number;
    checksum?: number;
    uncompressedSize?: number;
    compressedSize?: number;
}