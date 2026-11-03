import { copyFile, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { bundle, RELEASE, ROOT, require, run } from './common.mjs';

if (process.platform !== 'win32' || process.arch !== 'x64' || !process.version.startsWith('v24.')) {
  throw new Error('Windows x64 / Node 24 が必要');
}
const directory = join(RELEASE, 'svoice');
const intermediate = join(RELEASE, 'build');
await mkdir(directory, { recursive: true });
const assets = await bundle(intermediate);
const version = JSON.parse(await readFile(join(ROOT, 'backend/package.json'), 'utf8')).version;
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const builtAt = new Date().toISOString();
const main = join(intermediate, 'app.cjs');
await writeFile(main, `globalThis.__packagingVersion = ${JSON.stringify(`${version} (${commit})`)};\nglobalThis.__packagingReadAsset = key => Buffer.from(require('node:sea').getAsset(key));\nglobalThis.__packagingAssetKeys = ${JSON.stringify(Object.keys(assets))};\n${await readFile(main, 'utf8')}`);
const blob = join(intermediate, 'sea.blob');
const config = join(intermediate, 'sea.json');
await writeFile(config, JSON.stringify({ main, output: blob, assets, disableExperimentalSEAWarning: true, useSnapshot: false, useCodeCache: false }, null, 2));
run(process.execPath, ['--experimental-sea-config', config]);
const executable = join(directory, 'svoice.exe');
await copyFile(process.execPath, executable);
run(process.execPath, [require.resolve('postject/dist/cli.js'), executable, 'NODE_SEA_BLOB', blob, '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2']);
for (const file of ['svoice-service.xml', 'app.env.example']) await copyFile(join(ROOT, 'tools/package', file), join(directory, file));
const hash = createHash('sha256').update(await readFile(executable)).digest('hex');
await writeFile(join(directory, 'VERSION.txt'), `VERSION=${version}\nCOMMIT=${commit}\nBUILT_AT=${builtAt}\nSHA256=${hash}\n`);
console.log(`配布物: ${directory}`);
