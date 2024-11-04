const { startExpress } = require('./external/express');
const { startSocket } = require('./external/socket');
const { startDiscordServer } = require('./external/discordBot');

async function setupServer() {
  startExpress();
  startSocket();
  startDiscordServer();
}

setupServer();