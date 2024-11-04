const express = require('express');
const { createServer } = require('https');
const cors = require('cors');
const fs = require('fs');
const { Client, GatewayIntentBits, Status } = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');

require('dotenv').config();


async function startDiscordServer() {
  const bot = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildVoiceStates
    ]
  });
  
  bot.login(process.env.DISCORD_BOT_TOKEN);
  
  const app = express();

  app.use(express.json());
  
  app.use(cors({
    origin: 'https://kei-server.com',
    credentials: true,
    optionsSuccessStatus: 200
  }));
  
  const httpServer = createServer({
    key: fs.readFileSync('./key/privkey.pem'),
    cert: fs.readFileSync('./key/fullchain.pem')
  }, app);


  app.get('/getUserName', async (req, res) => {
    
    try {
      const id = req.query.id.toString();

      const guild = await bot.guilds.fetch(process.env.DISCORD_SERVER_ID);
      const member = await guild.members.fetch(id);

      const discordName = member.nickname;

      const regex = /\[([^\]]+)\]/;
      const match = discordName?.match(regex);
      const matchNickName = match ? match[1] : null;

      if(matchNickName == null) {
        throw 'Discord NickName Error'
      }

      res.status(200).json(matchNickName);

    } catch (err) {
      res.status(500).json({ error: 'Discord name inconsistency error'})
    }


  })

  app.get('/checkAdminRole', async (req, res) => {

    try {
      const id = req.query.id;

      const guild = await bot.guilds.fetch(process.env.DISCORD_SERVER_ID);
      const member = await guild.members.fetch(id);

      const hasAdmin = member.roles.cache.has(process.env.DISCORD_SERVER_ROLE_ID_ADMIN);

      let auth = false;

      if(!(!hasAdmin)) {
        auth = true;
      }

      res.status(200).json(auth);
    } catch(err) {
      console.log(err);
      res.status(500);
    }
  })

  app.get('/setPhoneRole', async (req, res) => {
    try {
      const id = req.query.id;

      const guild = await bot.guilds.fetch(process.env.DISCORD_SERVER_ID);
      const member = await guild.members.fetch(id);

      const hasPhone = member.roles.cache.has(process.env.DISCORD_SERVER_ROLE_ID_PHONE);

      if (!hasPhone) {
        await member.roles.add(process.env.DISCORD_SERVER_ROLE_ID_PHONE);
      }

      res.status(200);
    } catch(err) {
      console.error(err);
      res.status(500);
    }
  })

  app.get('/removePhoneRole', async (req, res) => {
    try {
      const id = req.query.id;

      const guild = await bot.guilds.fetch(process.env.DISCORD_SERVER_ID);
      const member = await guild.members.fetch(id);

      const hasPhone = member.roles.cache.has(process.env.DISCORD_SERVER_ROLE_ID_PHONE);

      if (!(!hasPhone)) {
        await member.roles.remove(process.env.DISCORD_SERVER_ROLE_ID_PHONE);
      }

      res.status(200);
    } catch(err) {
      console.error(err);
      res.status(500);
    }
  })

  app.listen(5000, () => {
    console.log('Discord server running on port 5000');
  })

  httpServer.listen(1234, () => {
    console.log('Discord server running on port 1234');
  })
}

module.exports = { startDiscordServer };