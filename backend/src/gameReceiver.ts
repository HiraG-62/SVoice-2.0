import express from 'express';
import { PLAYER_DATA_FIELDS, type PlayerData } from '@svoice/shared';

export const GAME_RECEIVER_PORT = 30000;
export const PLAYER_IDLE_TIMEOUT_MS = 5_000;

export function validatePlayerData(body: unknown): body is PlayerData[] {
  if (!Array.isArray(body)) return false;
  return body.every((player: unknown) => {
    if (typeof player !== 'object' || player === null) return false;
    if (!('name' in player) || typeof player.name !== 'string' || player.name.length === 0) return false;
    return PLAYER_DATA_FIELDS.every((field) => field in player);
  });
}

export function createGameReceiver({ gameApiSecret }: { gameApiSecret?: string } = {}) {
  const app = express();
  let data: PlayerData[] | null | undefined;
  let idleTimeout: ReturnType<typeof setTimeout> | undefined;
  const resetIdleTimer = () => {
    clearTimeout(idleTimeout);
    idleTimeout = setTimeout(() => { data = null; }, PLAYER_IDLE_TIMEOUT_MS);
  };

  app.use(express.json({ limit: '1mb' }));
  app.use((_req, _res, next) => {
    resetIdleTimer();
    next();
  });
  app.post('/', (req, res) => {
    // ゲームサーバーからのAPIシークレット認証
    if (gameApiSecret && req.headers['x-api-secret'] !== gameApiSecret) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (!validatePlayerData(req.body)) {
      res.status(400).json({ error: 'Invalid player data format' });
      return;
    }
    data = req.body;
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
