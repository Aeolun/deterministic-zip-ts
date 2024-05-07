# deterministic-zip-ts

> [!NOTE] 
> Based on the original [deterministic-zip](https://github.com/bitgenics/deterministic-zip) by Erwin van der Koogh. Which works fine, but I needed something that I had control over, and I like Typescript, and async.

Regular zip binaries and libraries often generate different zip files from the same files most often because of metadata or timestamps. `deterministic-zip-ts` guarantees to always generate the same zip file every time.

This is a major problem when creating a reproducible build. The output from two builds from identical source would generate two different zip files.

With `deterministic-zip-ts` you are guaranteed to get the exact same file every time you build from the same input.

## Features

- Now supports async/await
- Supports zip archives with more than 65k files
- Always returns a zip with the exact same hash for files with the same content
- Compresses in parallel, which is somehow faster than native zip (on the machine I tested it with)
- Does **not** support files larger than 4GB

## Install

`npm install deterministic-zip-ts --save`

## Usage

```javascript
import { zip } from 'deterministic-zip-ts';

await zip('data', 'test.zip', {
    includes: ['./index.js', './src/**'], 
    cwd: 'data'
});
```
