import {expect, test} from "vitest";
import {zip} from "../index";
import {mkdtemp} from "node:fs/promises";
import * as fs from "node:fs/promises";
import {createHash} from "node:crypto";
import {Options} from "../types";

test("it zips three files the same way every time", async () => {
    const tmpDir = await mkdtemp('dttest_')
    const origTmpFile = tmpDir+'/three.zip'
    const tmpFile = tmpDir+'/three2.zip'

    const dir = 'src/tests/examples/simple/data/'
    const options: Options = {
        includes: ['**/*.js', '*.js'],
        excludes: [],
        cwd: 'src/tests/examples/simple/data/'
    }

    await zip(dir, origTmpFile, options);
    await zip(dir, tmpFile, options);

    const staticArchive = await fs.readFile('src/tests/examples/simple/three.zip')
    const firstArchive = await fs.readFile(origTmpFile)
    const secondArchive = await fs.readFile(tmpFile)

    const firstHash = createHash('md5').update(firstArchive).digest().toString('hex')
    const secondHash = createHash('md5').update(secondArchive).digest().toString('hex')

    try {
        expect(firstArchive).toEqual(staticArchive);
        expect(firstArchive).toEqual(secondArchive)
        expect(firstHash).toEqual(secondHash)
    } catch(e) {
        throw e;
    } finally {
        await fs.rm(tmpDir, {
            recursive: true,
            force: true
        });
    }
})

test("it zips directories too", async () => {
    const tmpDir = await mkdtemp('dttest_')
    const origTmpFile = tmpDir+'/directory.zip'
    const tmpFile = tmpDir+'/directory2.zip'

    const dir = 'src/tests/examples/simple/data/'
    const options: Options = {
        includes: ['*'],
        excludes: [],
        cwd: 'src/tests/examples/simple/data/'
    }

    await zip(dir, origTmpFile, options);
    await zip(dir, tmpFile, options);

    const staticArchive = await fs.readFile('src/tests/examples/simple/directory.zip')
    const firstArchive = await fs.readFile(origTmpFile)
    const secondArchive = await fs.readFile(tmpFile)

    const firstHash = createHash('md5').update(firstArchive).digest().toString('hex')
    const secondHash = createHash('md5').update(secondArchive).digest().toString('hex')

    try {
        expect(firstArchive).toEqual(staticArchive);
        expect(firstArchive).toEqual(secondArchive)
        expect(firstHash).toEqual(secondHash)
    } catch(e) {
        throw e;
    } finally {
        await fs.rm(tmpDir, {
            recursive: true,
            force: true
        });
    }
})