import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bundle, RELEASE, run, measure } from './common.mjs';

const started = performance.now();
const directory = join(RELEASE, 'bun');
const assets = await bundle(directory);
const entry = join(directory, 'bun-entry.mjs');
const imports = Object.entries(assets).map(([key, file], index) => ({ key, file, name: `asset${index}` }));
await writeFile(entry, `${imports.map(({ file, name }) => `import ${name} from ${JSON.stringify(file)} with { type: 'file' };`).join('\n')}\nimport { readFileSync } from 'node:fs';\nconst assets = {${imports.map(({ key, name }) => `${JSON.stringify(key)}:${name}`).join(',')}};\nglobalThis.__packagingReadAsset = key => readFileSync(assets[key]);\nglobalThis.__packagingAssetKeys = Object.keys(assets);\nawait import('./app.cjs');\n`);
run('bun', ['build', '--compile', '--no-compile-autoload-dotenv', '--no-compile-autoload-bunfig', '--outfile', join(directory, 'svoice.exe'), entry, '--external', 'sharp', '--external', 'ffmpeg-static', '--external', '@discordjs/opus', '--external', 'node-opus', '--external', 'opusscript', '--external', 'sodium-native', '--external', 'sodium', '--external', 'libsodium-wrappers', '--external', '@snazzah/davey']);
await measure(directory, started, ['svoice.exe']);
