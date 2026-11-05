import { ingameSettingsSchema, type IngameSettings } from '@svoice/shared';
import { SEND_INTERVAL_MS } from '../fakeGame';
import { createBotManager, launchBot } from './bots';
import { listenLab } from './server';
import { createLabState } from './state';

const REQUEST_TIMEOUT_MS = 5_000;
const SETTINGS_INTERVAL_MS = 5_000;
const BOT_CHECK_INTERVAL_MS = 100;
const FRONTEND_CHECK_INTERVAL_MS = 1_000;
export interface VoiceLabOptions {
  listeners: string[]; bots: string[]; frontend: string; endpoint: string; secret?: string; port?: number;
}

export async function startVoiceLab(options: VoiceLabOptions, dependencies = { launch: launchBot }) {
  const frontend = new URL(options.frontend);
  if (!['http:', 'https:'].includes(frontend.protocol)) throw new Error('SERVER_URL が不正');
  const state = createLabState(options.listeners, options.bots);
  const abort = new AbortController();
  let closed = false, ready = false, checking = false, sending = false;
  let settings: IngameSettings | null = null;
  let settingsAt = 0;
  const requests = new Set<Promise<unknown>>();
  function track(work: Promise<unknown>) { requests.add(work); void work.finally(() => requests.delete(work)); }
  const signal = () => AbortSignal.any([abort.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]);
  const bots = createBotManager(state, name => dependencies.launch(name, frontend.href, message => {
    const row = state.rows.find(row => row.player.name === name);
    if (row?.bot) row.bot.message = message;
    console.warn(`${name}: ${message}`);
  }));
  const startBot = async (name: string) => { if (ready && !closed) await bots.start(name); };
  const server = await listenLab({ state, bots, settings: () => settings, startBot }, options.port);

  async function checkFrontend() {
    if (checking || closed) return;
    checking = true;
    try {
      if (!ready) {
        const home = await fetch(frontend, { signal: signal() });
        await home.arrayBuffer();
        if (home.status !== 200) return;
      }
      if (ready && Date.now() - settingsAt < SETTINGS_INTERVAL_MS) return;
      const response = await fetch(new URL('/api/getSetting', frontend), { signal: signal() });
      if (!response.ok) throw new Error();
      settings = ingameSettingsSchema.parse(await response.json());
      settingsAt = Date.now();
      state.settingsError = '';
      if (!ready && !closed) {
        ready = true;
        state.frontend = 'frontend 接続中';
        for (const row of state.rows) if (row.kind === 'bot') void startBot(row.player.name);
      }
    } catch {
      state.settingsError = '距離設定の取得失敗';
    } finally { checking = false; }
  }
  async function send() {
    if (!state.sending || sending || closed) return;
    sending = true;
    try {
      const response = await fetch(options.endpoint, { method: 'POST', headers: {
        'content-type': 'application/json', ...(options.secret ? { 'x-api-secret': options.secret } : {}),
      }, body: JSON.stringify(state.players()), signal: signal() });
      await response.arrayBuffer();
      state.lastSend = response.ok ? '成功' : `HTTP ${response.status}`;
    } catch { if (!closed) state.lastSend = '接続失敗'; }
    finally { sending = false; }
  }
  const timers = [setInterval(() => track(send()), SEND_INTERVAL_MS),
    setInterval(() => track(checkFrontend()), FRONTEND_CHECK_INTERVAL_MS),
    setInterval(() => track(bots.tick()), BOT_CHECK_INTERVAL_MS)];
  track(checkFrontend());
  track(send());
  let closing: Promise<void> | undefined;
  return { state, bots, url: server.url, close() {
    return closing ??= (async () => {
      closed = true;
      timers.forEach(clearInterval);
      abort.abort();
      await Promise.all([server.close(), bots.close(), Promise.allSettled([...requests])]);
    })();
  } };
}
