import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { Server } from 'socket.io';
import type { ClientToServerEvents, PlayerData, ServerToClientEvents } from '@svoice/shared';
import { verifySocketToken, type SocketTokenPayload } from '@svoice/shared/socket-token';
import type { BackendConfig } from './config';
import { createDebugLimiter, createDebugWriter } from './debugLog';

export const SOCKET_PORT = 3001;
export const PLAYER_DATA_INTERVAL_MS = 100;
const JOINED_ROOM = 'joined';

interface SocketServerDependencies {
  config: BackendConfig;
  getData: () => PlayerData[] | null | undefined;
  logsDirectory?: string;
  now?: () => Date;
  logger?: Pick<Console, 'log'>;
}

export function createSocketServer({ config, getData, logsDirectory = path.join(config.DATA_DIR, 'logs'), now = () => new Date(), logger = console }: SocketServerDependencies) {
  const server = config.isDevelopment ? http.createServer() : https.createServer({
    key: fs.readFileSync(config.TLS_KEY_PATH),
    cert: fs.readFileSync(config.TLS_CERT_PATH),
  });
  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketTokenPayload>(server, {
    cors: { origin: config.SERVER_URL, methods: ['GET', 'POST'] },
  });
  const users = new Map<string, string>();
  const speakers = new Set<string>();
  const speakerTags = () => Array.from(new Set(Array.from(speakers, (id) => users.get(id)).filter((tag): tag is string => tag !== undefined)));
  const writeDebug = createDebugWriter(logsDirectory, logger);

  io.use((socket, next) => {
    const token: unknown = socket.handshake.auth.token;
    const payload = typeof token === 'string' ? verifySocketToken(token, config.API_SECRET, now().getTime()) : null;
    if (!payload) { next(new Error('unauthorized')); return; }
    socket.data = payload;
    next();
  });

  const interval = setInterval(() => {
    if (users.size === 0) return;
    io.to(JOINED_ROOM).emit('playerData', getData() ?? []);
  }, PLAYER_DATA_INTERVAL_MS);
  io.engine.on('close', () => clearInterval(interval));

  io.on('connection', (socket) => {
    logger.log('接続: ' + socket.id);
    const isAdmin = (event: string) => {
      if (socket.data.admin) return true;
      logger.log(`操作拒否: ${event} ${socket.id}`);
      return false;
    };
    const removeSpeaker = () => {
      if (!speakers.delete(socket.id)) return;
      io.emit('setAdminSpeaker', speakerTags());
    };
    const leave = () => {
      removeSpeaker();
      users.delete(socket.id);
      void socket.leave(JOINED_ROOM);
    };

    socket.on('join', async () => {
      users.set(socket.id, socket.data.gamerTag);
      await socket.join(JOINED_ROOM);
      if (!socket.connected || !users.has(socket.id)) return;
      socket.emit('joined', speakerTags());
    });
    socket.on('changeSetting', () => {
      if (isAdmin('changeSetting')) io.emit('changeSetting');
    });
    socket.on('onSpeaker', () => {
      if (!isAdmin('onSpeaker') || !users.has(socket.id)) return;
      speakers.add(socket.id);
      io.emit('setAdminSpeaker', speakerTags());
    });
    socket.on('offSpeaker', () => {
      if (!speakers.has(socket.id) && !isAdmin('offSpeaker')) return;
      removeSpeaker();
    });
    socket.on('exit', leave);
    socket.on('kick', (tag) => {
      if (!isAdmin('kick') || typeof tag !== 'string' || tag.length === 0) return;
      for (const [id, gamerTag] of users) {
        if (gamerTag === tag) io.to(id).emit('kicked');
      }
    });
    socket.on('disconnect', () => {
      leave();
      logger.log('切断: ' + socket.id);
    });
    const acceptDebug = createDebugLimiter();
    socket.on('debug', (data) => {
      const date = now();
      if (!acceptDebug(data, date.getTime())) {
        logger.log(`debug 制限超過: ${socket.id}`);
        return;
      }
      writeDebug(socket.data.gamerTag, data, date);
    });
  });

  return { server, io };
}

export function startSocket(socketServer: ReturnType<typeof createSocketServer>, port = SOCKET_PORT): Promise<void> {
  return new Promise((resolve, reject) => {
    socketServer.server.once('error', reject);
    socketServer.server.listen(port, () => {
      socketServer.server.off('error', reject);
      console.log(`WebSocket server running on port ${port}`);
      resolve();
    });
  });
}
