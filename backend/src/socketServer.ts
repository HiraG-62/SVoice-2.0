import http from 'node:http';
import path from 'node:path';
import { Server } from 'socket.io';
import type { ClientToServerEvents, PlayerData, ServerToClientEvents } from '@svoice/shared';
import { verifySocketToken, type SocketTokenPayload } from '@svoice/shared/socket-token';
import type { BackendConfig } from './config';
import { createDebugLimiter, createDebugWriter } from './debugLog';
import { createReloadingHttpsServer } from './tls';

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
  const logEvent = (message: string) => {
    try { logger.log(message.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ')); } catch {}
  };
  const server = config.isDevelopment ? http.createServer() : createReloadingHttpsServer(config.TLS_KEY_PATH, config.TLS_CERT_PATH);
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
    logEvent(`接続: ${socket.data.gamerTag} ${socket.id}`);
    const isAdmin = (event: string) => {
      if (socket.data.admin) return true;
      logEvent(`操作拒否: ${event} ${socket.data.gamerTag} ${socket.id}`);
      return false;
    };
    const removeSpeaker = () => {
      if (!speakers.delete(socket.id)) return;
      io.emit('setAdminSpeaker', speakerTags());
      logEvent(`全体発言終了: ${socket.data.gamerTag}`);
    };
    const leave = (reason: string) => {
      removeSpeaker();
      const wasJoined = users.delete(socket.id);
      void socket.leave(JOINED_ROOM);
      if (wasJoined) logEvent(`退出: ${socket.data.gamerTag}（${reason}、参加中 ${users.size} 人）`);
    };

    socket.on('join', async () => {
      const wasJoined = users.has(socket.id);
      users.set(socket.id, socket.data.gamerTag);
      await socket.join(JOINED_ROOM);
      if (!socket.connected || !users.has(socket.id)) return;
      if (!wasJoined) logEvent(`参加: ${socket.data.gamerTag}（参加中 ${users.size} 人）`);
      socket.emit('joined', speakerTags());
    });
    socket.on('changeSetting', () => {
      if (!isAdmin('changeSetting')) return;
      io.emit('changeSetting');
      logEvent(`設定変更の通知: ${socket.data.gamerTag}`);
    });
    socket.on('onSpeaker', () => {
      if (!isAdmin('onSpeaker') || !users.has(socket.id)) return;
      const wasSpeaker = speakers.has(socket.id);
      speakers.add(socket.id);
      io.emit('setAdminSpeaker', speakerTags());
      if (!wasSpeaker) logEvent(`全体発言開始: ${socket.data.gamerTag}`);
    });
    socket.on('offSpeaker', () => {
      if (!speakers.has(socket.id) && !isAdmin('offSpeaker')) return;
      removeSpeaker();
    });
    socket.on('exit', () => leave('退出操作'));
    socket.on('kick', (tag) => {
      if (!isAdmin('kick') || typeof tag !== 'string' || tag.length === 0) return;
      let count = 0;
      for (const [id, gamerTag] of users) {
        if (gamerTag !== tag) continue;
        io.to(id).emit('kicked');
        count++;
      }
      logEvent(`キック: ${socket.data.gamerTag} → ${tag}（${count} 接続）`);
    });
    socket.on('disconnect', (reason) => {
      leave(reason);
      logEvent(`切断: ${socket.data.gamerTag} ${socket.id} ${reason}`);
    });
    const acceptDebug = createDebugLimiter();
    socket.on('debug', (data, ack) => {
      const reply = typeof ack === 'function' ? ack : undefined;
      const date = now();
      if (!acceptDebug(data, date.getTime())) {
        logEvent(`debug 制限超過: ${socket.data.gamerTag} ${socket.id}`);
        reply?.({ ok: false });
        return;
      }
      const ok = writeDebug(socket.data.gamerTag, data, date);
      if (ok) logEvent(`debug 保存: ${socket.data.gamerTag}`);
      reply?.({ ok });
    });
  });

  return { server, io };
}

export function startSocket(socketServer: ReturnType<typeof createSocketServer>, port = SOCKET_PORT): Promise<void> {
  const { server } = socketServer;
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      server.off('error', onError);
      server.off('close', onClose);
      server.off('listening', onListening);
    };
    const onError = (error: Error) => { cleanup(); reject(error); };
    const onClose = () => onError(new Error('listen 前に停止'));
    const onListening = () => {
      cleanup();
      console.log(`WebSocket server running on port ${port}`);
      resolve();
    };
    server.once('error', onError);
    server.once('close', onClose);
    server.once('listening', onListening);
    server.listen(port);
  });
}
