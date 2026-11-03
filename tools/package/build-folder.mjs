import { cp, copyFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bundle, RELEASE, measure } from './common.mjs';

const started = performance.now();
const directory = join(RELEASE, 'folder');
const assets = await bundle(directory);
for (const [key, file] of Object.entries(assets)) await cp(file, join(directory, key), { recursive: true });
await copyFile(process.execPath, join(directory, 'node.exe'));
await writeFile(join(directory, 'start.cjs'), `process.env.SVOICE_PACKAGING_FOLDER = '1';\nglobalThis.__packagingReadAsset = key => require('node:fs').readFileSync(require('node:path').join(__dirname, key));\nglobalThis.__packagingAssetKeys = ${JSON.stringify(Object.keys(assets))};\nrequire('./app.cjs');\n`);
await measure(directory, started, ['node.exe', 'app.cjs', 'start.cjs', ...Object.keys(assets)]);
