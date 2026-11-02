import { loadConfig, logConfigPaths } from './config';
import { createGameReceiver, startExpress } from './gameReceiver';
import { createSocketServer, startSocket } from './socketServer';
import { startDiscordServer } from './discordBot';

const config = loadConfig();
logConfigPaths(config);
const receiver = createGameReceiver({ gameApiSecret: config.GAME_API_SECRET });
startExpress(receiver, config.GAME_RECEIVER_PORT);
void startSocket(createSocketServer({ config, getData: receiver.getData }), config.SOCKET_PORT);
void startDiscordServer(config, receiver.getData);
