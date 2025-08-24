const express = require('express');
const http = require('http');
const https = require('https');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Status } = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');
const { getData } = require('./express')

require('dotenv').config();
const isDevelopment = process.env.NODE_ENV == 'dev';

async function startDiscordServer() {
  const {
    DISCORD_SERVER_ID,
    DISCORD_SERVER_ROOM_ID,
    DISCORD_SERVER_ROLE_ID_ADMIN,
    DISCORD_SERVER_ROLE_ID_PHONE,
    DISCORD_SERVER_ROLE_ID_JOIN
  } = process.env;

  const tokens = JSON.parse(fs.readFileSync(path.join(__dirname, '../env', 'tokens.json')))
  const bots = [];

  const loginWithRetry = async (token, index, delay = 60 * 1000) => {
    const bot = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates
      ]
    });

    while (true) {
      try {
        await bot.login(token);
        console.log(`✅ Bot #${index} logged in`);
        bots.push(bot);

        bot.user.setPresence({ status: 'invisible', activities: [] });
        return; // 成功したら次のボットへ
      } catch (err) {
        console.warn(`❌ Bot #${index} login failed. Retrying in ${delay / 1000}s...`);
        // await new Promise(res => setTimeout(res, delay));
      }
    }
  };

  const loginBotsSequentially = async () => {
    for (let i = 0; i < tokens.tokens.length; i++) {
      const token = tokens.tokens[i];
      await loginWithRetry(token, i); // 成功するまで待つ
      // await new Promise(res => setTimeout(res, 500)); // 次のログインまで2秒待機
    }

    console.log(`✅ All bots logged in!`);
  };

  await loginBotsSequentially();

  let guild;
  let voiceChannel;
  let connection;
  let count = 0;
  let botIndex = 0;

  const nextBot = () => {
    botIndex = (botIndex + 1) % bots.length;
  }

  const displayJoinMember = async () => {
    try {
      const data = getData();
      if (data) {
        playerCount = data.length;
      } else {
        playerCount = 9999;
      }

      if (count == playerCount || (count >= 20 && playerCount > 20)) {
        setTimeout(displayJoinMember, 10 * 1000);
        return;
      }

      connection.destroy();

      if (playerCount == 9999) {
        guild = await bots[21].guilds.fetch(DISCORD_SERVER_ID);
      } else if (playerCount >= 20) {
        guild = await bots[20].guilds.fetch(DISCORD_SERVER_ID);
      } else {
        guild = await bots[playerCount].guilds.fetch(DISCORD_SERVER_ID);
      }

      voiceChannel = guild.channels.cache.get(DISCORD_SERVER_ROOM_ID);

      connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
      });

      count = playerCount;
      setTimeout(displayJoinMember, 10 * 1000);
    } catch (err) {
      console.log(err);
    }
  };

  bots[bots.length - 1].once('ready', async () => {
    await new Promise(resolve => setTimeout(resolve, 3000));

    guild = await bots[0].guilds.fetch(DISCORD_SERVER_ID);
    voiceChannel = guild.channels.cache.get(DISCORD_SERVER_ROOM_ID);

    connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
    });

    displayJoinMember();
  })


  const app = express();
  let server;

  app.use(express.json());
  app.use(cors({
    origin: process.env.SERVER_URL,
    credentials: true,
    optionsSuccessStatus: 200
  }));

  if (isDevelopment) {
    server = http.createServer(app);
  } else {
    server = https.createServer({
      key: fs.readFileSync('./key/privkey.pem'),
      cert: fs.readFileSync('./key/fullchain.pem')
    }, app);
  }


  app.get('/getUserName', async (req, res) => {

    try {
      const id = req.query.id.toString();

      const guild = await bots[botIndex].guilds.fetch(DISCORD_SERVER_ID);
      const member = await guild.members.fetch(id);

      const discordName = member.nickname;

      const regex = /\[([^\]]+)\]/;
      const match = discordName?.match(regex);
      const matchNickName = match ? match[1] : null;

      if (matchNickName == null) {
        throw 'Discord NickName Error'
      }

      nextBot();

      res.status(200).json(matchNickName);

    } catch (err) {
      res.status(500).json({ error: 'Discord name inconsistency error' })
    }
  })

  app.post('/checkJoinPass', async (req, res) => {
    try {
      const body = req.body;

      if (body.pass == "syakasaba_4") {
        res.status(200).json(true);
      } else {
        res.status(200).json(false);
      }
    } catch (ex) {
      console.log(ex);
      res.status(500);
    }
  })

  app.get('/setJoinRole', async (req, res) => {
    try {
      const id = req.query.id;

      const guild = await bots[botIndex].guilds.fetch(DISCORD_SERVER_ID);
      const member = await guild.members.fetch(id);

      const hasPhone = member.roles.cache.has(DISCORD_SERVER_ROLE_ID_JOIN);

      if (!hasPhone) {
        await member.roles.add(DISCORD_SERVER_ROLE_ID_JOIN);
      }

      nextBot();

      res.status(200);
    } catch (err) {
      console.error(err);
      res.status(500);
    }
  })

  app.get('/getJoinRole', async (req, res) => {
    try {
      const id = req.query.id;

      const guild = await bots[botIndex].guilds.fetch(DISCORD_SERVER_ID);
      const member = await guild.members.fetch(id);

      const hasJoin = member.roles.cache.has(DISCORD_SERVER_ROLE_ID_JOIN);

      let auth = false;

      if (!(!hasJoin)) {
        auth = true;
      }

      nextBot();

      res.status(200).json(auth);
    } catch (err) {
      console.log(err);
      res.status(500);
    }
  })

  app.get('/checkAdminRole', async (req, res) => {

    try {
      const id = req.query.id;

      const guild = await bots[botIndex].guilds.fetch(DISCORD_SERVER_ID);
      const member = await guild.members.fetch(id);

      const hasAdmin = member.roles.cache.has(DISCORD_SERVER_ROLE_ID_ADMIN);

      let auth = false;

      if (!(!hasAdmin)) {
        auth = true;
      }

      nextBot();

      res.status(200).json(auth);
    } catch (err) {
      console.log(err);
      res.status(500);
    }
  })

  app.get('/setPhoneRole', async (req, res) => {
    try {
      const id = req.query.id;

      const guild = await bots[botIndex].guilds.fetch(DISCORD_SERVER_ID);
      const member = await guild.members.fetch(id);

      const hasPhone = member.roles.cache.has(DISCORD_SERVER_ROLE_ID_PHONE);

      if (!hasPhone) {
        await member.roles.add(DISCORD_SERVER_ROLE_ID_PHONE);
      }

      nextBot();

      res.status(200);
    } catch (err) {
      console.error(err);
      res.status(500);
    }
  })

  app.get('/removePhoneRole', async (req, res) => {
    try {
      const id = req.query.id;

      const guild = await bots[botIndex].guilds.fetch(DISCORD_SERVER_ID);
      const member = await guild.members.fetch(id);

      const hasPhone = member.roles.cache.has(DISCORD_SERVER_ROLE_ID_PHONE);

      if (!(!hasPhone)) {
        await member.roles.remove(DISCORD_SERVER_ROLE_ID_PHONE);
      }

      nextBot();

      res.status(200);
    } catch (err) {
      console.error(err);
      res.status(500);
    }
  })

  app.listen(5000, () => {
    console.log('Discord server running on port 5000');
  })

  server.listen(1234, () => {
    console.log('Discord server running on port 1234');
  })
}

module.exports = { startDiscordServer };