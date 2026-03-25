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
    DISCORD_SERVER_ROLE_ID_JOIN,
    JOIN_PASSWORD,
    API_SECRET
  } = process.env;

  if (!JOIN_PASSWORD) {
    console.error('❌ JOIN_PASSWORD environment variable is not set');
    process.exit(1);
  }
  if (!API_SECRET) {
    console.error('❌ API_SECRET environment variable is not set');
    process.exit(1);
  }

  const tokens = JSON.parse(fs.readFileSync(path.join(__dirname, '../env', 'tokens.json')))
  const bots = [];

  const MAX_LOGIN_RETRIES = 5;
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

    for (let attempt = 0; attempt < MAX_LOGIN_RETRIES; attempt++) {
      try {
        await bot.login(token);
        console.log(`✅ Bot #${index} logged in`);
        bots.push(bot);

        bot.user.setPresence({ status: 'invisible', activities: [] });
        return;
      } catch (err) {
        console.warn(`❌ Bot #${index} login failed (attempt ${attempt + 1}/${MAX_LOGIN_RETRIES}). Retrying in ${delay / 1000}s...`);
        await new Promise(res => setTimeout(res, delay));
      }
    }
    console.error(`❌ Bot #${index} login failed after ${MAX_LOGIN_RETRIES} attempts. Skipping.`);
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
      let playerCount;
      if (data) {
        playerCount = data.length;
      } else {
        playerCount = 0;
      }

      if (count == playerCount || (count >= 20 && playerCount > 20)) {
        setTimeout(displayJoinMember, 10 * 1000);
        return;
      }

      if (connection) {
        connection.destroy();
      }

      // Botインデックスを安全に決定（bots配列の範囲内に収める）
      const maxIndex = bots.length - 1;
      let targetIndex;
      if (playerCount >= 20) {
        targetIndex = Math.min(20, maxIndex);
      } else {
        targetIndex = Math.min(playerCount, maxIndex);
      }

      if (bots[targetIndex] == null) {
        console.error(`Bot #${targetIndex} is not available`);
        setTimeout(displayJoinMember, 10 * 1000);
        return;
      }

      guild = await bots[targetIndex].guilds.fetch(DISCORD_SERVER_ID);
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
      setTimeout(displayJoinMember, 10 * 1000);
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

  // API認証ミドルウェア（内部API用）
  const authenticateApi = (req, res, next) => {
    const secret = req.headers['x-api-secret'];
    if (!secret || secret !== API_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  };

  // ID検証ヘルパー
  const validateDiscordId = (id) => {
    return typeof id === 'string' && /^\d{17,20}$/.test(id);
  };

  if (isDevelopment) {
    server = http.createServer(app);
  } else {
    server = https.createServer({
      key: fs.readFileSync('./key/privkey.pem'),
      cert: fs.readFileSync('./key/fullchain.pem')
    }, app);
  }


  app.get('/getUserName', authenticateApi, async (req, res) => {

    try {
      const id = req.query.id?.toString();

      if (!validateDiscordId(id)) {
        return res.status(400).json({ error: 'Invalid Discord ID' });
      }

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

  app.post('/checkJoinPass', authenticateApi, async (req, res) => {
    try {
      const body = req.body;

      if (typeof body.pass !== 'string') {
        return res.status(400).json({ error: 'Invalid password format' });
      }

      if (body.pass === JOIN_PASSWORD) {
        res.status(200).json(true);
      } else {
        res.status(200).json(false);
      }
    } catch (ex) {
      console.log(ex);
      res.status(500).json({ error: 'Internal server error' });
    }
  })

  app.get('/setJoinRole', authenticateApi, async (req, res) => {
    try {
      const id = req.query.id?.toString();

      if (!validateDiscordId(id)) {
        return res.status(400).json({ error: 'Invalid Discord ID' });
      }

      const guild = await bots[botIndex].guilds.fetch(DISCORD_SERVER_ID);
      const member = await guild.members.fetch(id);

      const hasJoin = member.roles.cache.has(DISCORD_SERVER_ROLE_ID_JOIN);

      if (!hasJoin) {
        await member.roles.add(DISCORD_SERVER_ROLE_ID_JOIN);
      }

      nextBot();

      res.status(200).json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  })

  app.get('/getJoinRole', authenticateApi, async (req, res) => {
    try {
      const id = req.query.id?.toString();

      if (!validateDiscordId(id)) {
        return res.status(400).json({ error: 'Invalid Discord ID' });
      }

      const guild = await bots[botIndex].guilds.fetch(DISCORD_SERVER_ID);
      const member = await guild.members.fetch(id);

      const hasJoin = member.roles.cache.has(DISCORD_SERVER_ROLE_ID_JOIN);

      nextBot();

      res.status(200).json(!!hasJoin);
    } catch (err) {
      console.log(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  })

  app.get('/checkAdminRole', authenticateApi, async (req, res) => {

    try {
      const id = req.query.id?.toString();

      if (!validateDiscordId(id)) {
        return res.status(400).json({ error: 'Invalid Discord ID' });
      }

      const guild = await bots[botIndex].guilds.fetch(DISCORD_SERVER_ID);
      const member = await guild.members.fetch(id);

      const hasAdmin = member.roles.cache.has(DISCORD_SERVER_ROLE_ID_ADMIN);

      nextBot();

      res.status(200).json(!!hasAdmin);
    } catch (err) {
      console.log(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  })

  app.get('/setPhoneRole', authenticateApi, async (req, res) => {
    try {
      const id = req.query.id?.toString();

      if (!validateDiscordId(id)) {
        return res.status(400).json({ error: 'Invalid Discord ID' });
      }

      const guild = await bots[botIndex].guilds.fetch(DISCORD_SERVER_ID);
      const member = await guild.members.fetch(id);

      const hasPhone = member.roles.cache.has(DISCORD_SERVER_ROLE_ID_PHONE);

      if (!hasPhone) {
        await member.roles.add(DISCORD_SERVER_ROLE_ID_PHONE);
      }

      nextBot();

      res.status(200).json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  })

  app.get('/removePhoneRole', authenticateApi, async (req, res) => {
    try {
      const id = req.query.id?.toString();

      if (!validateDiscordId(id)) {
        return res.status(400).json({ error: 'Invalid Discord ID' });
      }

      const guild = await bots[botIndex].guilds.fetch(DISCORD_SERVER_ID);
      const member = await guild.members.fetch(id);

      const hasPhone = member.roles.cache.has(DISCORD_SERVER_ROLE_ID_PHONE);

      if (hasPhone) {
        await member.roles.remove(DISCORD_SERVER_ROLE_ID_PHONE);
      }

      nextBot();

      res.status(200).json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
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