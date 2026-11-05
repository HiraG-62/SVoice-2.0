import { chromium, type Page } from '@playwright/test';
import type { LabState } from './state';
import { createSpeechAudio } from './speech';

const JOIN_TIMEOUT_MS = 60_000;
export interface BotInspection { joined: boolean; speaker: boolean; muted: boolean; gameMute?: number }
export interface BotSession {
  inspect(): Promise<BotInspection>;
  speaker(enabled: boolean): Promise<void>;
  close(): Promise<void>;
}
type AppRoot = { __vue_app__: { config: { globalProperties: { $nuxt: {
  $pinia: { _s: Map<string, unknown> };
  $voice: { leave(): Promise<void>; debugSnapshot(): { socket: { connected: boolean } } };
} } } } };

export async function inspectBot(page: Page): Promise<BotInspection> {
  return page.evaluate(() => {
    const root = document.querySelector('#__nuxt') as unknown as AppRoot;
    const app = root.__vue_app__.config.globalProperties.$nuxt;
    const pinia = app.$pinia;
    const audio = pinia._s.get('audio') as { muted: boolean; setMuted(value: boolean): void };
    const call = pinia._s.get('call') as { status: string; speaking: boolean; gamerTag: string; players: { name: string; mute: number }[] };
    if (audio.muted) audio.setMuted(false);
    return { joined: call.status === 'joined' && app.$voice.debugSnapshot().socket.connected, speaker: call.speaking, muted: audio.muted,
      gameMute: call.players.find(player => player.name === call.gamerTag)?.mute };
  });
}

export async function launchBot(name: string, frontend: string, warning: (message: string) => void): Promise<BotSession> {
  const audio = await createSpeechAudio(name);
  if (audio.warning) warning(audio.warning);
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({ headless: true, args: [
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${audio.path}`,
    ] });
    const context = await browser.newContext({ permissions: ['microphone'] });
    const page = await context.newPage();
    const login = await context.request.post(new URL('/auth/dev', frontend).href, { data: { gamerTag: name, admin: true } });
    if (login.status() === 404) throw new Error('開発用ログイン無効');
    if (!login.ok()) throw new Error('開発用ログイン失敗');
    await page.goto(frontend, { timeout: JOIN_TIMEOUT_MS });
    await page.getByRole('button', { name: '参加', exact: true }).click({ timeout: JOIN_TIMEOUT_MS });
    await page.waitForFunction(() => {
      const root = document.querySelector('#__nuxt') as unknown as AppRoot;
      const call = root.__vue_app__.config.globalProperties.$nuxt.$pinia._s.get('call') as { status: string; error: string };
      return call.status === 'joined' || !!call.error;
    }, undefined, { timeout: JOIN_TIMEOUT_MS });
    if (!(await inspectBot(page)).joined) throw new Error('通話への参加失敗');
    return {
      inspect: () => inspectBot(page),
      speaker: async (enabled) => {
        if ((await inspectBot(page)).speaker !== enabled) await page.locator('.mdi-bullhorn').click();
        await page.waitForFunction((expected) => {
          const root = document.querySelector('#__nuxt') as unknown as AppRoot;
          return (root.__vue_app__.config.globalProperties.$nuxt.$pinia._s.get('call') as { speaking: boolean }).speaking === expected;
        }, enabled);
      },
      close: async () => {
        try {
          await page.evaluate(() => (document.querySelector('#__nuxt') as unknown as AppRoot)
            .__vue_app__.config.globalProperties.$nuxt.$voice.leave()).catch(() => {});
        } finally { try { await browser!.close(); } finally { await audio.close(); } }
      },
    };
  } catch (error) {
    await browser?.close();
    await audio.close();
    // ブラウザの例外にはリクエスト情報が含まれうるため、既知の文言だけを公開する。
    const message = error instanceof Error && ['開発用ログイン無効', '開発用ログイン失敗', '通話への参加失敗'].includes(error.message)
      ? error.message : 'ボット起動失敗';
    throw new Error(message);
  }
}

export function createBotManager(state: LabState, launch: (name: string) => Promise<BotSession>) {
  const sessions = new Map<string, BotSession>();
  const pending = new Map<string, Promise<void>>();
  let closed = false;
  let ticking = false;
  function fail(name: string, message: string) {
    const row = state.rows.find(row => row.player.name === name);
    if (row?.bot) Object.assign(row.bot, { status: 'error', speaker: false, message });
  }
  const manager = {
    async inspect(name: string) {
      const session = sessions.get(name);
      if (!session) throw new Error('ボット未参加');
      return session.inspect();
    },
    async start(name: string): Promise<void> {
      if (closed || sessions.has(name)) return;
      const row = state.find(name);
      if (!row.bot) throw new Error('ボット以外は操作不可');
      if (pending.has(name)) {
        await pending.get(name);
        if (!closed && state.rows.includes(row)) await manager.start(name);
        return;
      }
      Object.assign(row.bot, { status: 'starting', speaker: false, message: '' });
      const starting = (async () => {
        try {
          const session = await launch(name);
          if (closed || !state.rows.includes(row)) { await session.close(); return; }
          sessions.set(name, session);
          row.bot!.status = 'joined';
        } catch (error) {
          fail(name, error instanceof Error ? error.message : 'ボット起動失敗');
        }
      })();
      pending.set(name, starting);
      try { await starting; } finally { pending.delete(name); }
    },
    async tick() {
      if (closed || ticking) return;
      ticking = true;
      try {
        await Promise.all([...sessions].map(async ([name, session]) => {
          try {
            const result = await session.inspect();
            if (!result.joined) throw new Error('通話切断');
            const row = state.rows.find(row => row.player.name === name);
            if (row?.bot && row.bot.status !== 'error') row.bot.speaker = result.speaker;
          } catch {
            fail(name, '通話切断');
          }
        }));
      } finally { ticking = false; }
    },
    async speaker(name: string, enabled: boolean) {
      const session = sessions.get(name);
      const row = state.find(name);
      if (!session || row.bot?.status !== 'joined') throw new Error('ボット未参加');
      try {
        await session.speaker(enabled);
        row.bot.speaker = enabled;
      } catch { fail(name, '全体発言の切り替え失敗'); throw new Error('全体発言の切り替え失敗'); }
    },
    async restart(name: string) {
      await pending.get(name);
      const session = sessions.get(name);
      sessions.delete(name);
      await session?.close();
      await manager.start(name);
    },
    async remove(name: string) {
      state.remove(name);
      await pending.get(name);
      const session = sessions.get(name);
      sessions.delete(name);
      await session?.close();
    },
    async close() {
      closed = true;
      await Promise.allSettled([...pending.values()]);
      await Promise.allSettled([...sessions.values()].map(session => session.close()));
      sessions.clear();
    },
  };
  return manager;
}
export type BotManager = ReturnType<typeof createBotManager>;
