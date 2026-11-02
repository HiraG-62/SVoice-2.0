import { readFileSync } from 'node:fs';
import https from 'node:https';
import type { RequestListener } from 'node:http';
import { createSecureContext } from 'node:tls';
import { createHash } from 'node:crypto';

export const TLS_RELOAD_INTERVAL_MS = 1000;

export function createReloadingHttpsServer(keyPath: string, certPath: string, listener?: RequestListener) {
  const read = () => ({ key: readFileSync(keyPath), cert: readFileSync(certPath) });
  const fingerprint = (value: ReturnType<typeof read>) => createHash('sha256').update(value.key).update(value.cert).digest('hex');
  const initial = read();
  const server = https.createServer(initial, listener);
  let lastAttempt = fingerprint(initial);
  const interval = setInterval(() => {
    let attempt = 'unreadable';
    try {
      const options = read();
      attempt = fingerprint(options);
      if (attempt === lastAttempt) return;
      createSecureContext(options);
      server.setSecureContext(options);
    } catch {
      if (attempt !== lastAttempt) console.error('TLS 証明書の更新失敗');
    }
    lastAttempt = attempt;
  }, TLS_RELOAD_INTERVAL_MS);
  interval.unref();
  server.once('close', () => clearInterval(interval));
  return server;
}
