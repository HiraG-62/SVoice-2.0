import { existsSync } from 'node:fs';
import http from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createReloadingHttpsServer } from './tls.mjs';

const FRONTEND_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_PORT = 3000;
const MAX_PORT = 65535;

/** @param {string} [root] @param {NodeJS.ProcessEnv} [env] */
export function loadEnvironment(root = FRONTEND_ROOT, env = process.env) {
  const file = resolve(root, env.ENV_FILE ?? '.env.production');
  if (env.ENV_FILE !== undefined || existsSync(file)) process.loadEnvFile(file);
}

/**
 * @param {import('node:http').RequestListener} listener
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ intervalMs?: number, logger?: Pick<Console, 'error'> }} [dependencies]
 */
export function createFrontendServer(listener, env = process.env, dependencies = {}) {
  const key = env.TLS_KEY_PATH;
  const cert = env.TLS_CERT_PATH;
  if (Boolean(key) !== Boolean(cert)) throw new Error('TLS_KEY_PATH / TLS_CERT_PATH の設定不足');
  if (!key || !cert) return http.createServer(listener);
  return createReloadingHttpsServer(resolve(FRONTEND_ROOT, key), resolve(FRONTEND_ROOT, cert), listener, dependencies);
}

export async function start() {
  loadEnvironment();
  process.env.NODE_ENV ??= 'production';
  process.chdir(FRONTEND_ROOT);
  const { handler } = await import('../.output/server/index.mjs');
  const server = createFrontendServer(handler);
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1 || port > MAX_PORT) throw new Error('PORT の設定不正');
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      server.off('error', reject);
      resolveListen(undefined);
    });
  });
  console.log(`frontend 起動: ${server instanceof http.Server ? 'HTTP' : 'HTTPS'} :${port}`);
  return server;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await start();
}
