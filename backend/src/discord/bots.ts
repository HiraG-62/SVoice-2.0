import fs from 'node:fs';
import { Client, GatewayIntentBits } from 'discord.js';
import { z } from 'zod';

const MAX_LOGIN_RETRIES = 5;
const LOGIN_RETRY_DELAY_MS = 60_000;
const READY_TIMEOUT_MS = 30_000;
const READY_EVENT = 'clientReady';

function waitForRetry(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const finish = () => { signal?.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(finish, milliseconds);
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(signal?.reason); };
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  });
}

async function untilAbort<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation;
  if (signal.aborted) { void operation.catch(() => {}); signal.throwIfAborted(); }
  let abort: () => void = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
  });
  try { return await Promise.race([operation, cancelled]); }
  finally { signal.removeEventListener('abort', abort); }
}

export async function loginWithRetry(
  bot: { login: (token: string) => Promise<unknown> }, token: string, index: number,
  { wait, logger = console, onLoggedIn = () => {}, signal }: {
    wait?: (delay: number) => Promise<void>;
    logger?: Pick<Console, 'log' | 'warn' | 'error'>;
    onLoggedIn?: () => void;
    signal?: AbortSignal;
  } = {},
): Promise<boolean> {
  for (let attempt = 0; attempt < MAX_LOGIN_RETRIES; attempt++) {
    if (signal?.aborted) return false;
    try {
      await untilAbort(bot.login(token), signal);
      if (signal?.aborted) return false;
      logger.log(`Bot #${index} ログイン成功`);
      onLoggedIn();
      return true;
    } catch {
      if (signal?.aborted) return false;
      logger.warn(`Bot #${index} ログイン失敗: ${attempt + 1}/${MAX_LOGIN_RETRIES}`);
      try {
        await untilAbort(wait ? wait(LOGIN_RETRY_DELAY_MS) : waitForRetry(LOGIN_RETRY_DELAY_MS, signal), signal);
      } catch (error) { if (signal?.aborted) return false; throw error; }
    }
  }
  logger.error(`Bot #${index} ログイン中止`);
  return false;
}

export async function loginReadyBot(bot: Client, token: string, index: number, signal?: AbortSignal) {
  return loginWithRetry({ login: async (value) => {
    let finish: (ready: boolean) => void = () => {};
    const ready = new Promise<boolean>((resolve) => { finish = resolve; });
    const onReady = () => finish(true);
    bot.once(READY_EVENT, onReady);
    const timeout = setTimeout(() => finish(false), READY_TIMEOUT_MS);
    try {
      await untilAbort(bot.login(value), signal);
      if (bot.isReady()) finish(true);
      if (!await untilAbort(ready, signal)) throw new Error('Bot ready timeout');
    } finally {
      clearTimeout(timeout);
      bot.off(READY_EVENT, onReady);
    }
  } }, token, index, { signal });
}

export async function loadBots(tokensPath: string, { signal, onBot = () => {} }: {
  signal?: AbortSignal; onBot?: (bot: Client) => void;
} = {}): Promise<Client[]> {
  let tokens: string[];
  try {
    tokens = z.object({ tokens: z.array(z.string().min(1)) }).parse(JSON.parse(fs.readFileSync(tokensPath, 'utf8'))).tokens;
  } catch { return []; }
  const bots: Client[] = [];
  for (const [index, token] of tokens.entries()) {
    if (signal?.aborted) break;
    const bot = new Client({ intents: [
      GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildVoiceStates,
    ] });
    onBot(bot);
    if (!await loginReadyBot(bot, token, index, signal)) { await bot.destroy(); continue; }
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
