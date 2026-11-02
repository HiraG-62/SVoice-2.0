import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import https from 'node:https';
import type { TLSSocket } from 'node:tls';
import express from 'express';
import { generate } from 'selfsigned';
import { X509Certificate } from 'node:crypto';
import { createSocketServer } from '../src/socketServer';
import { createDiscordServers } from '../src/internalApi';
import { config } from './fixtures';
import { TLS_RELOAD_INTERVAL_MS } from '../src/tls';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});
function peer(server: https.Server) {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('待ち受けなし');
  return new Promise<string>((resolve, reject) => {
    const request = https.get({ hostname: '127.0.0.1', port: address.port, rejectUnauthorized: false, agent: false, path: '/socket.io/?EIO=4&transport=polling' }, (response) => {
      const fingerprint = (response.socket as TLSSocket).getPeerCertificate().fingerprint256;
      response.resume();
      response.on('end', () => resolve(fingerprint));
    });
    request.on('error', reject);
  });
}
describe.each(['socket', 'internal'] as const)('%s の TLS', (kind) => {
  it('置換を検知し、不正な更新後も古い証明書で応答して復旧する', async () => {
    const root = mkdtempSync(join(tmpdir(), 'svoice-tls-'));
    directories.push(root);
    const key = join(root, 'key.pem');
    const cert = join(root, 'cert.pem');
    const first = await generate([{ name: 'commonName', value: 'first' }], { keySize: 2048 });
    const second = await generate([{ name: 'commonName', value: 'second' }], { keySize: 2048 });
    writeFileSync(key, first.private);
    writeFileSync(cert, first.cert);
    const settings = { ...config, isDevelopment: false, TLS_KEY_PATH: key, TLS_CERT_PATH: cert };
    const logger = vi.spyOn(console, 'error').mockImplementation(() => {});
    const socket = kind === 'socket' ? createSocketServer({ config: settings, getData: () => [] }) : undefined;
    const app = express();
    app.use((_req, res) => res.end('ok'));
    const server = (socket?.server ?? createDiscordServers(app, settings).server) as https.Server;
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const original = await peer(server);
      writeFileSync(cert, 'invalid');
      await vi.waitFor(() => expect(logger).toHaveBeenCalledTimes(1), { timeout: TLS_RELOAD_INTERVAL_MS * 3 });
      expect(await peer(server)).toBe(original);
      writeFileSync(key + '.new', second.private);
      renameSync(key + '.new', key);
      writeFileSync(cert + '.new', second.cert);
      renameSync(cert + '.new', cert);
      await vi.waitFor(async () => expect(await peer(server)).toBe(new X509Certificate(second.cert).fingerprint256), { timeout: TLS_RELOAD_INTERVAL_MS * 3 });
    } finally {
      if (socket) await new Promise<void>((resolve) => socket.io.close(() => resolve()));
      else await new Promise<void>((resolve) => server.close(() => resolve()));
      logger.mockRestore();
    }
  }, 15000);
});
