import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import https from 'node:https';
import type { TLSSocket } from 'node:tls';
import { generate } from 'selfsigned';
import { X509Certificate } from 'node:crypto';
import { createFrontendServer, loadEnvironment } from '../scripts/start.mjs';

const directories: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});
function directory() {
  const value = mkdtempSync(join(tmpdir(), 'svoice-runtime-'));
  directories.push(value);
  return value;
}
function peer(server: https.Server) {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('待ち受けなし');
  return new Promise<string>((resolve, reject) => {
    const request = https.get({ hostname: '127.0.0.1', port: address.port, rejectUnauthorized: false, agent: false }, (response) => {
      const fingerprint = (response.socket as TLSSocket).getPeerCertificate().fingerprint256;
      response.resume();
      response.on('end', () => resolve(fingerprint));
    });
    request.on('error', reject);
  });
}
describe('本番起動', () => {
  it('ENV_FILE、既定ファイルの順で選び、既存の環境変数を優先する', () => {
    const root = directory();
    writeFileSync(join(root, '.env.production'), 'SVOICE_RUNTIME_TEST=default\n');
    writeFileSync(join(root, 'selected.env'), 'SVOICE_RUNTIME_TEST=selected\n');
    vi.stubEnv('SVOICE_RUNTIME_TEST', undefined);
    loadEnvironment(root, {});
    expect(process.env.SVOICE_RUNTIME_TEST).toBe('default');
    delete process.env.SVOICE_RUNTIME_TEST;
    loadEnvironment(root, { ENV_FILE: 'selected.env' });
    expect(process.env.SVOICE_RUNTIME_TEST).toBe('selected');
    process.env.SVOICE_RUNTIME_TEST = 'external';
    loadEnvironment(root, { ENV_FILE: 'selected.env' });
    expect(process.env.SVOICE_RUNTIME_TEST).toBe('external');
  });
  it('既定ファイルがなくても起動でき、指定ファイルの欠落はエラーになる', () => {
    const root = directory();
    expect(() => loadEnvironment(root, {})).not.toThrow();
    expect(() => loadEnvironment(root, { ENV_FILE: 'missing.env' })).toThrow();
  });
  it('TLS の片方だけの設定を拒否する', () => {
    expect(() => createFrontendServer((_req, res) => res.end(), { TLS_KEY_PATH: 'key.pem' })).toThrow();
    expect(() => createFrontendServer((_req, res) => res.end(), { TLS_CERT_PATH: 'cert.pem' })).toThrow();
  });
  it('TLS が未設定なら HTTP で応答する', async () => {
    const server = createFrontendServer((_req, res) => res.end('ok'), {});
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('待ち受けなし');
      expect(await (await fetch(`http://127.0.0.1:${address.port}`)).text()).toBe('ok');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it('証明書の置換を反映し、不正な更新中も応答して次の更新で復旧する', async () => {
    const root = directory();
    const key = join(root, 'key.pem');
    const cert = join(root, 'cert.pem');
    const first = await generate([{ name: 'commonName', value: 'first' }], { keySize: 2048 });
    const second = await generate([{ name: 'commonName', value: 'second' }], { keySize: 2048 });
    writeFileSync(key, first.private);
    writeFileSync(cert, first.cert);
    const logger = { error: vi.fn() };
    const server = createFrontendServer((_req, res) => res.end('ok'), { TLS_KEY_PATH: key, TLS_CERT_PATH: cert }, { intervalMs: 25, logger }) as https.Server;
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const original = await peer(server);
      writeFileSync(cert, 'invalid');
      await vi.waitFor(() => expect(logger.error).toHaveBeenCalledTimes(1));
      expect(await peer(server)).toBe(original);
      writeFileSync(key + '.new', second.private);
      renameSync(key + '.new', key);
      writeFileSync(cert + '.new', second.cert);
      renameSync(cert + '.new', cert);
      await vi.waitFor(async () => expect(await peer(server)).toBe(new X509Certificate(second.cert).fingerprint256));
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
