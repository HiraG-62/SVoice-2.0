import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import concurrently from 'concurrently';

const DEFAULT_DEV_PLAYERS = 'Alice,Bob';
const DEV_ENV_FILE_NAME = '.env.development';

function resolveDevEnvFile(variable, packageDir) {
  if (process.env[variable]) return process.env[variable];
  const file = resolve(packageDir, DEV_ENV_FILE_NAME);
  if (existsSync(file)) return file;
  console.warn(`${packageDir}/${DEV_ENV_FILE_NAME} なし: ${packageDir}/.env を使用`);
  return undefined;
}
const players = (process.env.DEV_PLAYERS ?? DEFAULT_DEV_PLAYERS).split(',').map(tag => tag.trim()).filter(Boolean);
if (players.length === 0) throw new Error('DEV_PLAYERS が空');

if (process.argv.includes('--fake-game')) {
  const child = spawn(process.execPath, [process.env.npm_execpath, '--filter', '@svoice/backend',
    'fake-game', '--scenario', 'sweep', ...players], { stdio: 'inherit' });
  child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', (code) => { process.exitCode = code ?? 1; });
} else {
  const env = { NUXT_PUBLIC_DEV_LOGIN_PRESETS: players.join(',') };
  const backendEnvFile = resolveDevEnvFile('ENV_FILE', 'backend');
  const frontendEnvFile = resolveDevEnvFile('FRONTEND_ENV_FILE', 'frontend');
  if (backendEnvFile) env.ENV_FILE = backendEnvFile;
  if (frontendEnvFile) env.FRONTEND_ENV_FILE = frontendEnvFile;
  const { result } = concurrently([
    { name: 'backend', command: 'pnpm --filter @svoice/backend dev', env },
    { name: 'frontend', command: 'pnpm --filter @svoice/frontend dev', env },
    ...(process.argv.includes('--e2e') ? [] : [{ name: 'fake-game', command: 'node frontend/scripts/dev.mjs --fake-game', env }]),
  ], { prefix: 'name', prefixColors: ['blue', 'green', 'magenta'], killOthersOn: [] });
  result.catch(() => { process.exitCode = 1; });
}
