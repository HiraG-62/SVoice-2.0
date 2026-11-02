import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { Server } from 'socket.io';
import type { ClientToServerEvents, PlayerData, ServerToClientEvents } from '@svoice/shared';
import type { BackendConfig } from './config';

export const SOCKET_PORT = 3001;
export const PLAYER_DATA_INTERVAL_MS = 100;
const MAX_GAMER_TAG_LENGTH = 100;

interface SocketServerDependencies {
  config: BackendConfig;
  getData: () => PlayerData[] | null | undefined;
  logsDirectory?: string;
  now?: () => Date;
  logger?: Pick<Console, 'log'>;
}

export function createSocketServer({ config, getData, logsDirectory = './logs', now = () => new Date(), logger = console }: SocketServerDependencies) {
  const server = config.isDevelopment ? http.createServer() : https.createServer({
    key: fs.readFileSync('./key/privkey.pem'),
    cert: fs.readFileSync('./key/fullchain.pem'),
  });
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
    cors: { origin: config.SERVER_URL, methods: ['GET', 'POST'] },
  });
  const userMap = new Map<string, { gamerTag: string | null }>();
  const adminSpeaker = new Set<string | null>();

  io.on('connection', (socket) => {
    logger.log('New client connected: ' + socket.id);
    userMap.set(socket.id, { gamerTag: null });

    socket.on('join', (data) => {
      if (typeof data !== 'string' || data.length === 0 || data.length > MAX_GAMER_TAG_LENGTH) return;
      userMap.set(socket.id, { gamerTag: data });
      socket.emit('joined', Array.from(adminSpeaker));
    });

    const intervalId = setInterval(() => {
      if (userMap.get(socket.id) != null) {
        const data = getData();
        if (data != null) socket.emit('playerData', data);
      }
    }, PLAYER_DATA_INTERVAL_MS);

    socket.on('changeSetting', () => { io.emit('changeSetting'); });
    socket.on('onSpeaker', () => {
      const speaker = userMap.get(socket.id)!;
      adminSpeaker.add(speaker.gamerTag);
      io.emit('setAdminSpeaker', Array.from(adminSpeaker));
    });
    socket.on('offSpeaker', () => {
      const speaker = userMap.get(socket.id)!;
      adminSpeaker.delete(speaker.gamerTag);
      io.emit('setAdminSpeaker', Array.from(adminSpeaker));
    });
    const removeSpeaker = () => {
      const user = userMap.get(socket.id);
      if (user && adminSpeaker.has(user.gamerTag)) {
        adminSpeaker.delete(user.gamerTag);
        io.emit('setAdminSpeaker', Array.from(adminSpeaker));
      }
    };
    socket.on('exit', removeSpeaker);
    socket.on('kick', (data) => {
      if (typeof data !== 'string' || data.length === 0) return;
      const id = Array.from(userMap).find(([, user]) => user.gamerTag == data)?.[0] || null;
      if (id) io.to(id).emit('kicked');
    });
    socket.on('disconnect', () => {
      clearInterval(intervalId);
      removeSpeaker();
      userMap.delete(socket.id);
      logger.log('Client disconnected: ' + socket.id);
    });
    socket.on('debug', (data) => {
      const date = now();
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      const formatDate = `${yyyy}-${mm}-${dd}`;
      const logDir = path.resolve(logsDirectory);
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

      // 書き込み先ファイル
      const logPath = path.join(logDir, `${formatDate}.jsonl`);

      // ログを追記（上書きなら flag を外す）
      fs.writeFileSync(logPath, JSON.stringify(data) + '\n', { flag: 'a' });
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
