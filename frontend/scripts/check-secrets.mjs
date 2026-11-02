import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SECRET_VARIABLES = [
  'NUXT_APP_SECRET',
  'NUXT_SKYWAY_APP_ID',
  'NUXT_SKYWAY_SECRET_KEY',
  'NUXT_API_SECRET',
  'NUXT_OAUTH_DISCORD_CLIENT_ID',
  'NUXT_OAUTH_DISCORD_CLIENT_SECRET',
  'NUXT_OAUTH_DISCORD_REDIRECT_URL',
];
const marker = `SVOICE_SECRET_MARKER_${randomUUID()}`;
const directory = await mkdtemp(join(tmpdir(), 'svoice-secrets-'));
try {
  const envFile = join(directory, 'build.env');
  await writeFile(envFile, '');
  const env = { ...process.env, FRONTEND_ENV_FILE: envFile };
  for (const key of SECRET_VARIABLES) env[key] = `${marker}_${key}`;
  await new Promise((resolveBuild, reject) => {
    const child = spawn(process.execPath, ['scripts/nuxt.mjs', 'build'], { cwd: FRONTEND_ROOT, env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolveBuild(undefined) : reject(new Error('秘密情報検査用ビルドの失敗')));
  });
  const leaked = [];
  const visited = new Set();
  async function scan(directory) {
    const canonical = await realpath(directory);
    if (visited.has(canonical)) return;
    visited.add(canonical);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if ((await stat(file)).isDirectory()) await scan(file);
      else if ((await readFile(file)).includes(Buffer.from(marker))) leaked.push(file);
    }
  }
  await scan(join(FRONTEND_ROOT, '.output'));
  if (leaked.length) throw new Error(`秘密情報の埋め込み: ${leaked.join(', ')}`);
  console.log('秘密情報検査: 成果物への埋め込みなし');
} finally {
  await rm(directory, { recursive: true, force: true });
}
