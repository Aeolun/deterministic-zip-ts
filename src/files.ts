import {ExtendedStats, Options} from "./types";
import {Stats} from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {minimatch} from "minimatch";

const shouldInclude2 = (file: string, options: Options) => {
    if (!options.includes || !options.excludes) {
        throw new Error("Should have includes and excludes options")
    }

    const include = options.includes.find((pattern) => {
        return minimatch(file, pattern, {matchBase: true})
    });
    if (include) {
        const exclude = options.excludes.find((pattern) => minimatch(file, pattern, {matchBase: true}));
        return include && !exclude
    } else {
        return false
    }
}
const addDir = async (list: Stats[], options: Options, dir: string) => {
    const files = await fs.readdir(dir);
    const dirs = []
    for (const elem of files) {
        const file = dir + '/' + elem;
        const info = await fs.stat(file) as ExtendedStats;
        info.relativePath = path.relative(options.cwd ?? '.', file);
        const check = info.isDirectory() ? info.relativePath + '/' : info.relativePath;
        if (shouldInclude2(check, options)) {
            info.filename = elem
            info.absolutePath = path.resolve(file);
            list.push(info);
        }
        if (info.isDirectory()) {
            dirs.push(file);
        }
    }
    for (const dir of dirs) {
        await addDir(list, options, dir)
    }
}
export const getFiles = async (dir: string, options: Options) => {
    const files: ExtendedStats[] = []
    await addDir(files, options, dir)
    return files
}