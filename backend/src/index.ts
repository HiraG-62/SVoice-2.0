import { loadConfig, logConfigPaths } from './config';
import { createGameReceiver, startExpress } from './gameReceiver';
import { createSocketServer, startSocket } from './socketServer';
import { createDiscordService, startDiscordServer } from './discordBot';
import type { Server } from 'node:http';

export function startEmbeddedBackend(onFailure: (error: Error) => void, registerClose: (close: () => Promise<void>) => void) {
  const servers: Server[] = [];
  let stopping = false;
  let closeSocket: (() => Promise<void>) | undefined;
  let discord: ReturnType<typeof createDiscordService> | undefined;
  const watch = (server: Server) => {
    servers.push(server);
    server.on('error', onFailure);
    server.on('close', () => { if (!stopping) onFailure(new Error('backend サーバーの予期しない停止')); });
  };
  registerClose(async () => {
    stopping = true;
    await Promise.all([
      closeSocket?.(), discord?.close(),
      ...servers.map(server => new Promise<void>(resolve => { server.close(() => resolve()); })),
    ]);
  });
  return (async () => {
    const config = loadConfig();
    logConfigPaths(config);
    const receiver = createGameReceiver({ gameApiSecret: config.GAME_API_SECRET, allowedIps: config.GAME_ALLOWED_IPS });
    watch(startExpress(receiver, config.GAME_RECEIVER_PORT));
    const socket = createSocketServer({ config, getData: receiver.getData });
    watch(socket.server);
    closeSocket = () => new Promise(resolve => { socket.io.close(() => resolve()); });
    const socketReady = startSocket(socket, config.SOCKET_PORT);
    discord = createDiscordService(config, receiver.getData, { onServer: watch });
    await Promise.all([socketReady, discord.ready]);
  })();
}

if (process.env.SVOICE_EMBEDDED !== '1') {
  const config = loadConfig();
  logConfigPaths(config);
  const receiver = createGameReceiver({ gameApiSecret: config.GAME_API_SECRET, allowedIps: config.GAME_ALLOWED_IPS });
  startExpress(receiver, config.GAME_RECEIVER_PORT);
  void startSocket(createSocketServer({ config, getData: receiver.getData }), config.SOCKET_PORT);
  void startDiscordServer(config, receiver.getData);
}
