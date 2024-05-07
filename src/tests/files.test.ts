import {expect, test} from "vitest";
import {zip} from "../index";
import {mkdtemp} from "node:fs/promises";
import { cwd } from "node:process";
import {getFiles} from "../files";

test("it matches the files", async () => {
    const result = await getFiles('src/tests/examples/simple/data', {
        includes: ['**/*.js'],
        excludes: [],
        cwd: cwd()
    });

    expect(result).toMatchObject([
        {
            relativePath: 'src/tests/examples/simple/data/index.js'
        },
        {
            relativePath: 'src/tests/examples/simple/data/src/blah.js'
        },
        {
            relativePath: 'src/tests/examples/simple/data/src/deeper/more.js'
        }
    ])
})