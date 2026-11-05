import express, { type RequestHandler } from 'express';
import http from 'node:http';
import path from 'node:path';
import type { BackendConfig } from './config';
import { restrictIps } from './ipAccess';
import { createJoinLockStore, MAX_JOIN_FAILURES } from './joinLockStore';
import { createReloadingHttpsServer } from './tls';

export const DISCORD_HTTP_PORT = 5000;
export const DISCORD_TLS_PORT = 1234;
const UNKNOWN_MEMBER_CODE = 10007;
export const DISCORD_STARTING = 'discord_starting';

export interface DiscordMember {
  nickname: string | null;
  roles: {
    cache: { has: (role: string) => boolean };
    add: (role: string) => Promise<unknown>;
    remove: (role: string) => Promise<unknown>;
  };
}

interface DiscordGuild {
  members: { fetch: (id: string) => Promise<DiscordMember> };
}

interface DiscordAppDependencies {
  config: BackendConfig;
  fetchGuild: () => Promise<DiscordGuild>;
  nextBot: () => void;
  isStarting?: () => boolean;
  logger?: Pick<Console, 'log' | 'error'>;
}

export function describeError(error: unknown) {
  if (!(error instanceof Error)) return String(error);
  const { code, status } = error as Error & { code?: unknown; status?: unknown };
  return [error.name, code, status, error.message].filter(value => value !== undefined && value !== '').join(' ');
}

export function validateDiscordId(id: unknown): id is string {
  return typeof id === 'string' && /^\d{17,20}$/.test(id);
}

export function createDiscordApp({ config, fetchGuild, nextBot, isStarting = () => false, logger = console }: DiscordAppDependencies) {
  const app = express();
  app.use(restrictIps(config.INTERNAL_API_ALLOWED_IPS));
  app.use(express.json());

  // API認証ミドルウェア（内部API用）
  const authenticateApi: RequestHandler = (req, res, next) => {
    const secret = req.headers['x-api-secret'];
    if (!secret || secret !== config.API_SECRET) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  };
  app.use(authenticateApi);

  app.get('/getUserName', async (req, res) => {
    const id = req.query.id?.toString();
    if (!validateDiscordId(id)) {
      res.status(400).json({ error: 'Invalid Discord ID' });
      return;
    }
    const fail = (status: number, error: string) => {
      logger.log(`getUserName: ${error} ...${id.slice(-4)}`);
      res.status(status).json({ error });
    };
    if (config.DISCORD_ENABLED && isStarting()) { fail(503, DISCORD_STARTING); return; }
    if (!config.DISCORD_ENABLED) { fail(503, 'discord_unavailable'); return; }
    try {
      const guild = await fetchGuild();
      const member = await guild.members.fetch(id);
      if (!member) { fail(404, 'member_not_found'); return; }
      const match = member.nickname?.match(/\[([^\]]+)\]/);
      if (!match) { fail(422, 'nickname_missing'); return; }
      nextBot();
      res.status(200).json(match[1]);
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === UNKNOWN_MEMBER_CODE) {
        fail(404, 'member_not_found');
        return;
      }
      fail(500, 'internal_error');
    }
  });

  const updateRole = async (id: string, role: string, operation: 'check' | 'add' | 'remove', disabledResult = false) => {
    if (!config.DISCORD_ENABLED) return operation === 'check' ? disabledResult : { success: true };
    const guild = await fetchGuild();
    const member = await guild.members.fetch(id);
    const hasRole = member.roles.cache.has(role);
    if (operation === 'add' && !hasRole) await member.roles.add(role);
    if (operation === 'remove' && hasRole) await member.roles.remove(role);
    nextBot();
    return operation === 'check' ? hasRole : { success: true };
  };
  const roleHandler = (role: string, operation: 'check' | 'add' | 'remove', disabledResult = false): RequestHandler => async (req, res) => {
    const id = req.query.id?.toString();
    if (!validateDiscordId(id)) { res.status(400).json({ error: 'Invalid Discord ID' }); return; }
    if (config.DISCORD_ENABLED && isStarting()) { res.status(503).json({ error: DISCORD_STARTING }); return; }
    try {
      res.status(200).json(await updateRole(id, role, operation, disabledResult));
    } catch (error) {
      logger.error(`ロール操作失敗: ${operation}: ${describeError(error)}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
  app.get('/getJoinRole', roleHandler(config.DISCORD_SERVER_ROLE_ID_JOIN, 'check', true));
  app.get('/checkAdminRole', roleHandler(config.DISCORD_SERVER_ROLE_ID_ADMIN, 'check'));
  app.get('/setPhoneRole', roleHandler(config.DISCORD_SERVER_ROLE_ID_PHONE, 'add'));
  app.get('/removePhoneRole', roleHandler(config.DISCORD_SERVER_ROLE_ID_PHONE, 'remove'));

  let store: ReturnType<typeof createJoinLockStore> | undefined;
  const getStore = () => store ??= createJoinLockStore(path.join(config.DATA_DIR, 'join-locks.json'));
  app.post('/joinAuth', async (req, res) => {
    const id: unknown = req.body?.id;
    const pass: unknown = req.body?.pass;
    const gamerTag: unknown = req.body?.gamerTag;
    if (!validateDiscordId(id) || typeof pass !== 'string' || typeof gamerTag !== 'string' || !gamerTag.length) {
      res.status(400).json({ error: 'Invalid join auth' });
      return;
    }
    try {
      const locks = getStore();
      const result = await locks.withLock(id, async () => {
        if ((locks.get(id)?.failures ?? 0) >= MAX_JOIN_FAILURES) return { ok: false, locked: true, remaining: 0 };
        if (pass !== config.JOIN_PASSWORD) {
          const { failures } = locks.fail(id, gamerTag);
          return { ok: false, locked: failures >= MAX_JOIN_FAILURES, remaining: MAX_JOIN_FAILURES - failures };
        }
        if (req.body?.skipRole !== true) {
          if (config.DISCORD_ENABLED && isStarting()) return { error: DISCORD_STARTING };
          await updateRole(id, config.DISCORD_SERVER_ROLE_ID_JOIN, 'add');
        }
        locks.clear(id);
        return { ok: true, locked: false, remaining: MAX_JOIN_FAILURES };
      });
      res.status('error' in result ? 503 : 200).json(result);
    } catch (error) {
      logger.error(`参加認証失敗: ${describeError(error)}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  app.get('/joinLocks', (_req, res) => {
    try { res.json(getStore().list()); }
    catch { logger.error('参加ロック読み込み失敗'); res.status(500).json({ error: 'Internal server error' }); }
  });
  app.post('/unlockJoin', async (req, res) => {
    const id: unknown = req.body?.id;
    if (!validateDiscordId(id)) { res.status(400).json({ error: 'Invalid Discord ID' }); return; }
    try {
      const locks = getStore();
      await locks.withLock(id, async () => { locks.clear(id); });
      res.json({ success: true });
    } catch {
      logger.error('参加ロック解除失敗');
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  return app;
}

export function createDiscordServers(app: ReturnType<typeof createDiscordApp>, config: BackendConfig) {
  const server = config.isDevelopment ? http.createServer(app) : createReloadingHttpsServer(config.TLS_KEY_PATH, config.TLS_CERT_PATH, app);
  return { httpServer: http.createServer(app), server };
}

export function listenDiscordServers(servers: ReturnType<typeof createDiscordServers>, config: BackendConfig) {
  return Promise.all(([
    [servers.httpServer, config.DISCORD_HTTP_PORT], [servers.server, config.DISCORD_TLS_PORT],
  ] as const).map(([server, port]) => new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      server.off('error', onError);
      server.off('close', onClose);
      server.off('listening', onListening);
    };
    const onError = (error: Error) => { cleanup(); reject(error); };
    const onClose = () => onError(new Error('listen 前に停止'));
    const onListening = () => {
      cleanup();
      console.log(`Discord server running on port ${port}`);
      resolve();
    };
    server.once('error', onError);
    server.once('close', onClose);
    server.once('listening', onListening);
    server.listen(port);
  })));
}
