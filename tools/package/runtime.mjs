import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { join, resolve, dirname } from 'node:path';
import { createReloadingHttpsServer } from '../../frontend/scripts/tls.mjs';
import { createHash } from 'node:crypto';
import dotenv from 'dotenv';
import { publicAssetKey } from './common.mjs';

const CONTENT_TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg' };
const DEFAULT_FRONTEND_PORT = 3000;
const MAX_PORT = 65535;

export async function launch(loadBackend, loadFrontend) {
  const root = globalThis.__packagingRoot;
  process.chdir(root);
  const envFile = resolve(root, process.env.ENV_FILE ?? 'app.env');
  if (process.env.ENV_FILE || existsSync(envFile)) {
    if (process.loadEnvFile) process.loadEnvFile(envFile);
    else {
      const result = dotenv.config({ path: envFile, quiet: true });
      if (result.error) throw result.error;
    }
  }
  process.env.ENV_FILE = envFile;
  process.env.NODE_ENV ??= 'production';
  process.env.DATA_DIR ??= join(root, 'data/backend');
  process.env.NUXT_DATA_DIR ??= join(root, 'data/frontend');
  const readAsset = globalThis.__packagingReadAsset;
  const assetKeys = new Set(globalThis.__packagingAssetKeys);
  globalThis.__packagingLoadDavey = () => {
    const binary = readAsset('native/davey.node');
    const hash = createHash('sha256').update(binary).digest('hex');
    const nativePath = resolve(root, process.env.DATA_DIR, 'native', `${hash}.node`);
    if (!existsSync(nativePath)) {
      mkdirSync(dirname(nativePath), { recursive: true });
      writeFileSync(nativePath, binary);
    }
    const module = { exports: {} };
    process.dlopen(module, nativePath);
    return module.exports;
  };
  const defaultFile = join(root, 'settings/default.json');
  mkdirSync(dirname(defaultFile), { recursive: true });
  writeFileSync(defaultFile, readAsset('settings/default.json'));
  await loadBackend();
  const { handler } = await loadFrontend();
  const listener = (request, response) => {
    const key = publicAssetKey(request.url ?? '/');
    if (!key || !assetKeys.has(key) || !['GET', 'HEAD'].includes(request.method)) return handler(request, response);
    const body = readAsset(key);
    response.setHeader('content-type', CONTENT_TYPES[key.slice(key.lastIndexOf('.'))] ?? 'application/octet-stream');
    response.setHeader('content-length', body.length);
    response.end(request.method === 'HEAD' ? undefined : body);
  };
  const key = process.env.TLS_KEY_PATH;
  const cert = process.env.TLS_CERT_PATH;
  if (Boolean(key) !== Boolean(cert)) throw new Error('TLS_KEY_PATH / TLS_CERT_PATH の設定不足');
  const server = key && cert
    ? createReloadingHttpsServer(resolve(root, key), resolve(root, cert), listener)
    : http.createServer(listener);
  const port = Number(process.env.PORT ?? DEFAULT_FRONTEND_PORT);
  if (!Number.isInteger(port) || port < 1 || port > MAX_PORT) throw new Error('PORT の設定不正');
  server.listen(port, () => console.log('試作 frontend 起動'));
}
