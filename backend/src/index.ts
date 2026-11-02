import { loadConfig } from './config';
import { createGameReceiver, startExpress } from './gameReceiver';
import { createSocketServer, startSocket } from './socketServer';
import { startDiscordServer } from './discordBot';

const config = loadConfig();
const receiver = createGameReceiver({ gameApiSecret: config.GAME_API_SECRET });
startExpress(receiver);
void startSocket(createSocketServer({ config, getData: receiver.getData }));
void startDiscordServer(config, receiver.getData);
