import { readFileSync } from 'node:fs';
import https from 'node:https';
import { createSecureContext } from 'node:tls';
import { createHash } from 'node:crypto';

const TLS_RELOAD_INTERVAL_MS = 1000;

/**
 * @param {string} keyPath
 * @param {string} certPath
 * @param {import('node:http').RequestListener} listener
 * @param {{ intervalMs?: number, logger?: Pick<Console, 'error'> }} [dependencies]
 */
export function createReloadingHttpsServer(keyPath, certPath, listener, { intervalMs = TLS_RELOAD_INTERVAL_MS, logger = console } = {}) {
  const read = () => ({ key: readFileSync(keyPath), cert: readFileSync(certPath) });
  /** @param {ReturnType<typeof read>} value */
  const fingerprint = (value) => createHash('sha256').update(value.key).update(value.cert).digest('hex');
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
      if (attempt !== lastAttempt) logger.error('TLS 証明書の更新失敗');
    }
    lastAttempt = attempt;
  }, intervalMs);
  interval.unref();
  server.once('close', () => clearInterval(interval));
  return server;
}
