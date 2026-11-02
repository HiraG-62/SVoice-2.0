import express, { type RequestHandler } from 'express';
import http from 'node:http';
import https from 'node:https';
import cors from 'cors';
import fs from 'node:fs';
import { Client, GatewayIntentBits } from 'discord.js';
import { joinVoiceChannel, type VoiceConnection } from '@discordjs/voice';
import type { PlayerData } from '@svoice/shared';
import type { BackendConfig } from './config';

export const DISCORD_HTTP_PORT = 5000;
export const DISCORD_TLS_PORT = 1234;
const MAX_LOGIN_RETRIES = 5;
const LOGIN_RETRY_DELAY_MS = 60_000;
const MEMBER_DISPLAY_INTERVAL_MS = 10_000;
const INITIAL_VOICE_DELAY_MS = 3_000;
const MAX_DISPLAY_PLAYER_COUNT = 20;

export interface DiscordMember {
  nickname: string | null;
  roles: {
    cache: { has: (role: string) => boolean };
    add: (role: string) => Promise<unknown>;
    remove: (role: string) => Promise<unknown>;
  };
}

interface DiscordGuild {
  members: { fetch: (id: string) => Promise<DiscordMember> };
}

interface DiscordAppDependencies {
  config: BackendConfig;
  fetchGuild: () => Promise<DiscordGuild>;
  nextBot: () => void;
  logger?: Pick<Console, 'log' | 'error'>;
}

export function validateDiscordId(id: unknown): id is string {
  return typeof id === 'string' && /^\d{17,20}$/.test(id);
}

export function createDiscordApp({ config, fetchGuild, nextBot, logger = console }: DiscordAppDependencies) {
  const app = express();
  app.use(express.json());
  app.use(cors({ origin: config.SERVER_URL, credentials: true, optionsSuccessStatus: 200 }));

  // API認証ミドルウェア（内部API用）
  const authenticateApi: RequestHandler = (req, res, next) => {
    const secret = req.headers['x-api-secret'];
    if (!secret || secret !== config.API_SECRET) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  };

  app.get('/getUserName', authenticateApi, async (req, res) => {
    try {
      const id = req.query.id?.toString();
      if (!validateDiscordId(id)) {
        res.status(400).json({ error: 'Invalid Discord ID' });
        return;
      }
      if (!config.DISCORD_ENABLED) {
        res.status(500).json({ error: 'Discord name inconsistency error' });
        return;
      }
      const guild = await fetchGuild();
      const member = await guild.members.fetch(id);
      const discordName = member.nickname;
      const regex = /\[([^\]]+)\]/;
      const match = discordName?.match(regex);
      const matchNickName = match ? match[1] : null;
      if (matchNickName == null) throw 'Discord NickName Error';
      nextBot();
      res.status(200).json(matchNickName);
    } catch {
      res.status(500).json({ error: 'Discord name inconsistency error' });
    }
  });

  app.post('/checkJoinPass', authenticateApi, async (req, res) => {
    try {
      const body: { pass?: unknown } = req.body;
      if (typeof body.pass !== 'string') {
        res.status(400).json({ error: 'Invalid password format' });
        return;
      }
      res.status(200).json(body.pass === config.JOIN_PASSWORD);
    } catch (error) {
      logger.log(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  const roleHandler = (roleId: string, operation: 'check' | 'add' | 'remove', disabledResult = false): RequestHandler => async (req, res) => {
    try {
      const id = req.query.id?.toString();
      if (!validateDiscordId(id)) {
        res.status(400).json({ error: 'Invalid Discord ID' });
        return;
      }
      if (!config.DISCORD_ENABLED) {
        res.status(200).json(operation === 'check' ? disabledResult : { success: true });
        return;
      }
      const guild = await fetchGuild();
      const member = await guild.members.fetch(id);
      const hasRole = member.roles.cache.has(roleId);
      if (operation === 'add' && !hasRole) await member.roles.add(roleId);
      if (operation === 'remove' && hasRole) await member.roles.remove(roleId);
      nextBot();
      res.status(200).json(operation === 'check' ? !!hasRole : { success: true });
    } catch (error) {
      if (operation === 'check') logger.log(error);
      else logger.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  app.get('/setJoinRole', authenticateApi, roleHandler(config.DISCORD_SERVER_ROLE_ID_JOIN, 'add'));
  app.get('/getJoinRole', authenticateApi, roleHandler(config.DISCORD_SERVER_ROLE_ID_JOIN, 'check', true));
  app.get('/checkAdminRole', authenticateApi, roleHandler(config.DISCORD_SERVER_ROLE_ID_ADMIN, 'check'));
  app.get('/setPhoneRole', authenticateApi, roleHandler(config.DISCORD_SERVER_ROLE_ID_PHONE, 'add'));
  app.get('/removePhoneRole', authenticateApi, roleHandler(config.DISCORD_SERVER_ROLE_ID_PHONE, 'remove'));
  return app;
}

export function createDiscordServers(app: ReturnType<typeof createDiscordApp>, config: BackendConfig) {
  const server = config.isDevelopment ? http.createServer(app) : https.createServer({
    key: fs.readFileSync(config.TLS_KEY_PATH),
    cert: fs.readFileSync(config.TLS_CERT_PATH),
  }, app);
  return { httpServer: http.createServer(app), server };
}

export function listenDiscordServers(servers: ReturnType<typeof createDiscordServers>, config: BackendConfig) {
  servers.httpServer.listen(config.DISCORD_HTTP_PORT, () => {
    console.log(`Discord server running on port ${config.DISCORD_HTTP_PORT}`);
  });
  servers.server.listen(config.DISCORD_TLS_PORT, () => {
    console.log(`Discord server running on port ${config.DISCORD_TLS_PORT}`);
  });
}

export function calculateBotIndex(playerCount: number, botsLength: number): number {
  const maxIndex = botsLength - 1;
  // Botインデックスを安全に決定（bots配列の範囲内に収める）
  return Math.min(playerCount >= MAX_DISPLAY_PLAYER_COUNT ? MAX_DISPLAY_PLAYER_COUNT : playerCount, maxIndex);
}

export async function loginWithRetry(
  bot: { login: (token: string) => Promise<unknown> }, token: string, index: number,
  { wait = (delay: number) => new Promise<void>((resolve) => setTimeout(resolve, delay)), logger = console, onLoggedIn = () => {} }: {
    wait?: (delay: number) => Promise<void>;
    logger?: Pick<Console, 'log' | 'warn' | 'error'>;
    onLoggedIn?: () => void;
  } = {},
): Promise<boolean> {
  for (let attempt = 0; attempt < MAX_LOGIN_RETRIES; attempt++) {
    try {
      await bot.login(token);
      logger.log(`✅ Bot #${index} logged in`);
      onLoggedIn();
      return true;
    } catch {
      logger.warn(`❌ Bot #${index} login failed (attempt ${attempt + 1}/${MAX_LOGIN_RETRIES}). Retrying in ${LOGIN_RETRY_DELAY_MS / 1000}s...`);
      await wait(LOGIN_RETRY_DELAY_MS);
    }
  }
  logger.error(`❌ Bot #${index} login failed after ${MAX_LOGIN_RETRIES} attempts. Skipping.`);
  return false;
}

export async function startDiscordServer(config: BackendConfig, getData: () => PlayerData[] | null | undefined) {
  if (!config.DISCORD_ENABLED) {
    console.log('Discord 機能は無効');
    const app = createDiscordApp({ config, fetchGuild: async () => { throw new Error('Discord 機能は無効'); }, nextBot: () => {} });
    const servers = createDiscordServers(app, config);
    listenDiscordServers(servers, config);
    return servers;
  }
  const tokens: { tokens: string[] } = JSON.parse(fs.readFileSync(config.DISCORD_TOKENS_PATH, 'utf8'));
  const bots: Client[] = [];
  for (let i = 0; i < tokens.tokens.length; i++) {
    const bot = new Client({ intents: [
      GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildVoiceStates,
    ] });
    await loginWithRetry(bot, tokens.tokens[i], i, { onLoggedIn: () => {
      bots.push(bot);
      bot.user!.setPresence({ status: 'invisible', activities: [] });
    } }); // 成功するまで待つ
    // await new Promise(res => setTimeout(res, 500)); // 次のログインまで2秒待機
  }
  console.log('✅ All bots logged in!');

  let connection: VoiceConnection | undefined;
  let count = 0;
  let botIndex = 0;
  const nextBot = () => { botIndex = (botIndex + 1) % bots.length; };

  const connectVoice = async (index: number) => {
    const guild = await bots[index].guilds.fetch(config.DISCORD_SERVER_ID);
    const voiceChannel = guild.channels.cache.get(config.DISCORD_SERVER_ROOM_ID)!;
    return joinVoiceChannel({ channelId: voiceChannel.id, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator });
  };
  const displayJoinMember = async () => {
    try {
      const data = getData();
      const playerCount = data ? data.length : 0;
      if (count == playerCount || (count >= MAX_DISPLAY_PLAYER_COUNT && playerCount > MAX_DISPLAY_PLAYER_COUNT)) {
        setTimeout(displayJoinMember, MEMBER_DISPLAY_INTERVAL_MS);
        return;
      }
      if (connection) connection.destroy();
      const targetIndex = calculateBotIndex(playerCount, bots.length);
      if (bots[targetIndex] == null) {
        console.error(`Bot #${targetIndex} is not available`);
        setTimeout(displayJoinMember, MEMBER_DISPLAY_INTERVAL_MS);
        return;
      }
      connection = await connectVoice(targetIndex);
      count = playerCount;
      setTimeout(displayJoinMember, MEMBER_DISPLAY_INTERVAL_MS);
    } catch (error) {
      console.log(error);
      setTimeout(displayJoinMember, MEMBER_DISPLAY_INTERVAL_MS);
    }
  };

  if (config.DISCORD_MEMBER_COUNT_ENABLED && bots.length > 0) bots[bots.length - 1].once('ready', async () => {
    await new Promise((resolve) => setTimeout(resolve, INITIAL_VOICE_DELAY_MS));
    connection = await connectVoice(0);
    displayJoinMember();
  });

  const app = createDiscordApp({ config, fetchGuild: () => bots[botIndex].guilds.fetch(config.DISCORD_SERVER_ID), nextBot });
  const servers = createDiscordServers(app, config);
  listenDiscordServers(servers, config);
  return servers;
}
