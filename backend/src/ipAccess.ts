import type { RequestHandler } from 'express';

export const DEFAULT_ALLOWED_IPS = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
export const LOG_INTERVAL_MS = 60_000;

export function createThrottledLog(logger: Pick<Console, 'log'>, now: () => number = Date.now) {
  const loggedAt = new Map<string, number>();
  return (key: string, message: string) => {
    const time = now();
    for (const [entry, timestamp] of loggedAt) {
      if (time - timestamp >= LOG_INTERVAL_MS) loggedAt.delete(entry);
    }
    if (loggedAt.has(key)) return;
    loggedAt.set(key, time);
    logger.log(message);
  };
}

export function restrictIps(allowedIps: readonly string[], log?: (ip: string) => void): RequestHandler {
  const allowed = new Set(allowedIps);
  return (req, res, next) => {
    const ip = req.socket.remoteAddress ?? '';
    if (allowed.has('*') || allowed.has(ip)) {
      next();
      return;
    }
    log?.(ip);
    res.status(403).json({ error: 'Forbidden' });
  };
}
