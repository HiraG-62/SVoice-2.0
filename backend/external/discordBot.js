const express = require('express');
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

  app.listen(5000, () => {
    console.log('Discord server running on port 5000');
  })
}

module.exports = { startDiscordServer };