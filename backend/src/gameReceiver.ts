import express, { type ErrorRequestHandler } from 'express';
import { PLAYER_DATA_FIELDS, type PlayerData } from '@svoice/shared';
import { createThrottledLog, DEFAULT_ALLOWED_IPS, restrictIps } from './ipAccess';

export const GAME_RECEIVER_PORT = 30000;
export const PLAYER_IDLE_TIMEOUT_MS = 5_000;
export const MAX_PLAYERS = 500;

function validationError(body: unknown): string | null {
  if (!Array.isArray(body)) return '配列が必要';
  if (body.length > MAX_PLAYERS) return '人数超過';
  for (const player of body) {
    if (typeof player !== 'object' || player === null || Array.isArray(player)) return 'プレイヤー形式不正';
    const record = player as Record<string, unknown>;
    if (typeof record.name !== 'string' || record.name.length === 0) return 'name が不正';
    for (const field of PLAYER_DATA_FIELDS) {
      if (field === 'name') continue;
      const value = record[field];
      if (typeof value === 'boolean') continue;
      if (typeof value === 'number' && Number.isFinite(value)) continue;
      if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) continue;
      return `${field} が不正`;
    }
  }
  return null;
}

export function validatePlayerData(body: unknown): body is PlayerData[] {
  return validationError(body) === null;
}

export function createGameReceiver({ gameApiSecret, allowedIps = DEFAULT_ALLOWED_IPS, logger = console, now = Date.now }: {
  gameApiSecret?: string; allowedIps?: readonly string[]; logger?: Pick<Console, 'log'>; now?: () => number;
} = {}) {
  const app = express();
  let data: PlayerData[] | null | undefined;
  let idleTimeout: ReturnType<typeof setTimeout> | undefined;
  const resetIdleTimer = () => {
    clearTimeout(idleTimeout);
    idleTimeout = setTimeout(() => { data = null; }, PLAYER_IDLE_TIMEOUT_MS);
  };

  const log = createThrottledLog(logger, now);
  app.use(restrictIps(allowedIps, (ip) => log(`ip:${ip}`, `受信拒否: ${ip}`)));
  app.use(express.json({ limit: '1mb' }));
  const invalidBody: ErrorRequestHandler = (error: unknown, _req, res, next) => {
    const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined;
    if (status !== 400 && status !== 413) { next(error); return; }
    log('format', `受信形式不正: ${status === 413 ? '容量超過' : 'JSON が不正'}`);
    res.status(status).json({ error: 'Invalid player data format' });
  };
  app.use(invalidBody);
  app.post('/', (req, res) => {
    // ゲームサーバーからのAPIシークレット認証
    if (gameApiSecret && req.headers['x-api-secret'] !== gameApiSecret) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const reason = validationError(req.body);
    if (reason) {
      log('format', `受信形式不正: ${reason}`);
      res.status(400).json({ error: 'Invalid player data format' });
      return;
    }
    data = req.body;
    resetIdleTimer();
    res.status(200).json({ success: true });
  });

  return { app, getData: () => data, resetIdleTimer, dispose: () => clearTimeout(idleTimeout) };
}

export function startExpress(receiver: ReturnType<typeof createGameReceiver>, port = GAME_RECEIVER_PORT) {
  const server = receiver.app.listen(port, () => {
    console.log(`Express server running on port ${port}`);
    receiver.resetIdleTimer();
  });
  server.once('close', receiver.dispose);
  return server;
}
