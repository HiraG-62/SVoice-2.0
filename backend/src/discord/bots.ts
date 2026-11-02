import fs from 'node:fs';
import { Client, GatewayIntentBits } from 'discord.js';
import { z } from 'zod';

const MAX_LOGIN_RETRIES = 5;
const LOGIN_RETRY_DELAY_MS = 60_000;
const READY_TIMEOUT_MS = 30_000;
const READY_EVENT = 'clientReady';

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
      logger.log(`Bot #${index} ログイン成功`);
      onLoggedIn();
      return true;
    } catch {
      logger.warn(`Bot #${index} ログイン失敗: ${attempt + 1}/${MAX_LOGIN_RETRIES}`);
      await wait(LOGIN_RETRY_DELAY_MS);
    }
  }
  logger.error(`Bot #${index} ログイン中止`);
  return false;
}

export async function loginReadyBot(bot: Client, token: string, index: number) {
  return loginWithRetry({ login: async (value) => {
    let finish: (ready: boolean) => void = () => {};
    const ready = new Promise<boolean>((resolve) => { finish = resolve; });
    const onReady = () => finish(true);
    bot.once(READY_EVENT, onReady);
    const timeout = setTimeout(() => finish(false), READY_TIMEOUT_MS);
    try {
      await bot.login(value);
      if (bot.isReady()) finish(true);
      if (!await ready) throw new Error('Bot ready timeout');
    } finally {
      clearTimeout(timeout);
      bot.off(READY_EVENT, onReady);
    }
  } }, token, index);
}

export async function loadBots(tokensPath: string): Promise<Client[]> {
  let tokens: string[];
  try {
    tokens = z.object({ tokens: z.array(z.string().min(1)) }).parse(JSON.parse(fs.readFileSync(tokensPath, 'utf8'))).tokens;
  } catch { return []; }
  const bots: Client[] = [];
  for (const [index, token] of tokens.entries()) {
    const bot = new Client({ intents: [
      GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildVoiceStates,
    ] });
    if (!await loginReadyBot(bot, token, index)) { await bot.destroy(); continue; }
    bot.user?.setPresence({ status: 'invisible', activities: [] });
    bots.push(bot);
  }
  return bots;
}

export function createBotPool(bots: Client[], guildId: string) {
  let index = 0;
  return {
    fetchGuild: () => bots[index].guilds.fetch(guildId),
    nextBot: () => { if (bots.length) index = (index + 1) % bots.length; },
  };
}
