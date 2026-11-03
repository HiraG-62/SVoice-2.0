import { createRequire } from 'node:module';
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const RELEASE = join(ROOT, 'release');
export const require = createRequire(import.meta.url);

export function publicAssetKey(url) {
  let path;
  try { path = decodeURIComponent(url.split('?')[0]); } catch { return; }
  if (!path.startsWith('/') || path.includes('\\') || path.includes('\0') || path.split('/').includes('..')) return;
  return `public${path}`;
}

export async function files(directory, prefix = '') {
  const result = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const key = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(result, await files(join(directory, entry.name), key));
    else result[key] = join(directory, entry.name);
  }
  return result;
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command}: exit ${result.status}`);
}

export async function bundle(directory) {
  await mkdir(directory, { recursive: true });
  const esbuild = require(require.resolve('esbuild', { paths: [require.resolve('tsup', { paths: [join(ROOT, 'backend')] })] }));
  const assets = await files(join(ROOT, 'frontend/.output/public'), 'public');
  assets['settings/default.json'] = join(ROOT, 'frontend/settings/default.json');
  const voice = require.resolve('@discordjs/voice', { paths: [join(ROOT, 'backend')] });
  const davey = require.resolve('@snazzah/davey', { paths: [dirname(voice)] });
  assets['native/davey.node'] = require.resolve('@snazzah/davey-win32-x64-msvc', { paths: [dirname(davey)] });
  await writeFile(join(directory, 'assets.json'), JSON.stringify(assets, null, 2));
  const entry = join(directory, 'entry.mjs');
  await writeFile(entry, `import { launch } from ${JSON.stringify(join(ROOT, 'tools/package/runtime.mjs'))};\nvoid launch(() => import(${JSON.stringify(join(ROOT, 'backend/dist/index.cjs'))}).then(module => module.default ?? module), () => import(${JSON.stringify(join(ROOT, 'frontend/.output/server/index.mjs'))}));\n`);
  await esbuild.build({
    entryPoints: [entry], outfile: join(directory, 'app.cjs'), bundle: true,
    platform: 'node', format: 'cjs', target: 'node24', sourcemap: false,
    nodePaths: [join(ROOT, 'backend/node_modules')],
    external: ['sharp', 'ffmpeg-static', '@discordjs/opus', 'node-opus', 'opusscript', 'sodium-native', 'sodium', 'libsodium-wrappers', '@snazzah/davey'],
    define: {
      'import.meta.url': 'globalThis.__packagingImportUrl',
      '__dirname': 'globalThis.__packagingBackendDist',
    },
    banner: { js: `globalThis.__packagingRoot = require('node:path').dirname(process.execPath);\nglobalThis.__packagingBackendDist = require('node:path').join(globalThis.__packagingRoot, 'dist');\nglobalThis.__packagingImportUrl = require('node:url').pathToFileURL(require('node:path').join(globalThis.__packagingRoot, 'server/index.mjs')).href;` },
    logLevel: 'warning',
    logOverride: { 'ignored-bare-import': 'silent' },
    plugins: [{
      name: 'packaging-davey',
      setup(build) {
        build.onResolve({ filter: /^@snazzah\/davey$/ }, () => ({ path: 'davey', namespace: 'packaging' }));
        build.onLoad({ filter: /.*/, namespace: 'packaging' }, () => ({ contents: 'module.exports = globalThis.__packagingLoadDavey();', loader: 'js' }));
      },
    }],
  });
  return assets;
}
