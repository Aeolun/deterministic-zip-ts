import {expect, test} from "vitest";
import {zip} from "../index";
import {mkdtemp} from "node:fs/promises";
import * as fs from "node:fs/promises";
import {createHash} from "node:crypto";
import {Options} from "../types";
// import zipOriginal from 'deterministic-zip';

const createTempDir = async () => {
    return mkdtemp('cache/dttest_');
}

test("it zips three files the same way every time", async () => {
    const tmpDir = await createTempDir()
    const origTmpFile = tmpDir+'/three.zip'
    const tmpFile = tmpDir+'/three2.zip'

    const dir = 'src/tests/examples/simple/data/'
    const options: Options = {
        includes: ['**/*.js', '*.js'],
        excludes: [],
        cwd: 'src/tests/examples/simple/data/'
    }

    try {
        await zip(dir, origTmpFile, options);
        await zip(dir, tmpFile, options);

        const staticArchive = await fs.readFile('src/tests/examples/simple/three.zip')
        const firstArchive = await fs.readFile(origTmpFile)
        const secondArchive = await fs.readFile(tmpFile)

        const firstHash = createHash('md5').update(firstArchive).digest().toString('hex')
        const secondHash = createHash('md5').update(secondArchive).digest().toString('hex')

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
    const tmpDir = await createTempDir()
    const origTmpFile = tmpDir+'/directory.zip'
    const tmpFile = tmpDir+'/directory2.zip'

    const dir = 'src/tests/examples/simple/data/'
    const options: Options = {
        includes: ['*'],
        excludes: [],
        cwd: 'src/tests/examples/simple/data/'
    }

    try {
        await zip(dir, origTmpFile, options);
        await zip(dir, tmpFile, options);

        const staticArchive = await fs.readFile('src/tests/examples/simple/directory.zip')
        const firstArchive = await fs.readFile(origTmpFile)
        const secondArchive = await fs.readFile(tmpFile)

        const firstHash = createHash('md5').update(firstArchive).digest().toString('hex')
        const secondHash = createHash('md5').update(secondArchive).digest().toString('hex')

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

// test("it zips three files the same way as the original", async () => {
//     const tmpDir = await mkdtemp('dttest_')
//     const origTmpFile = tmpDir+'/orig_test.zip'
//     const tmpFile = tmpDir+'/test.zip'
//
//     const dir = 'src/tests/examples/simple/data/'
//     const options: Options = {
//         includes: ['*'],
//         excludes: [],
//         cwd: 'src/tests/examples/simple/data/'
//     }
//
//     await zip(dir, origTmpFile, options);
//     await new Promise((resolve, reject) => {
//         zipOriginal(dir, tmpFile, options, (err) => {
//             if(err) {
//                 reject(err);
//             } else {
//                 resolve(true);
//             }
//         });
//     });
//
//     const firstArchive = await fs.readFile(origTmpFile)
//     const secondArchive = await fs.readFile(tmpFile)
//
//     const firstHash = createHash('md5').update(firstArchive).digest().toString('hex')
//     const secondHash = createHash('md5').update(secondArchive).digest().toString('hex')
//
//     try {
//         expect(firstArchive).toEqual(secondArchive)
//         expect(firstHash).toEqual(secondHash)
//     } catch(e) {
//         throw e;
//     } finally {
//         // await fs.rm(tmpDir, {
//         //     recursive: true,
//         //     force: true
//         // });
//     }
// })

test("it zips many, many small files", async () => {
    const tmpDir = await createTempDir()
    const origTmpFile = tmpDir+'/orig_test.zip'

    const dir = 'src/tests/examples/manyfiles/data/'
    const options: Options = {
        includes: ['*'],
        excludes: [],
        cwd: dir
    }

    // create 70000 small files to test with. We make these dynamically because the full set is
    // 270MB and I don't want to commit that to the repo.
    await fs.mkdir(dir, { recursive: true });
    for (let i = 0; i < 70000; i++) {
        await fs.writeFile(dir + i + '.b', '0');
    }
    console.log("Files created")

    try {
        await zip(dir, origTmpFile, options);

        expect(true).toBe(true)
    } catch(e) {
        throw e;
    } finally {
        await fs.rm(tmpDir, {
            recursive: true,
            force: true
        });
    }
}, {
    timeout: 120000
})