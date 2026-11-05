import { expect, test, type Page } from '@playwright/test';
import { loadEnvironment } from '../backend/src/config';
import { resolveFakeGameEndpoint } from '../backend/scripts/fakeGame';
import { startVoiceLab } from '../backend/scripts/voiceLab/runtime';
import type { createVoiceSession } from '../frontend/composables/useVoice';

type Root = Element & { __vue_app__: { config: { globalProperties: { $nuxt: {
  $voice: ReturnType<typeof createVoiceSession>;
} } } } };
async function diagnostic(page: Page) {
  return page.evaluate(() => (document.querySelector('#__nuxt') as Root).__vue_app__.config.globalProperties.$nuxt.$voice.debugSnapshot());
}

test('voice-lab の予想・実際の受信・常時送信・ブラウザの後始末', async ({ page, request }) => {
  const env: NodeJS.ProcessEnv = { ENV_FILE: '.env.development' };
  loadEnvironment(env);
  const listener = `Lab-Alice-${Date.now()}`, bot = `Lab-Bot-${Date.now()}`;
  const lab = await startVoiceLab({ listeners: [listener], bots: [bot],
    frontend: 'http://localhost:3100', endpoint: resolveFakeGameEndpoint(env), secret: env.GAME_API_SECRET, port: 0 });
  const action = async (body: unknown) => {
    const response = await request.post(`${lab.url}/api/action`, { data: body });
    expect(response.ok()).toBe(true);
  };
  const prediction = async () => (await (await request.get(`${lab.url}/api/state`)).json()).decisions[0] as {
    subscribe: boolean; volume: number; step: number;
  };
  let joined = false;
  try {
    await expect.poll(() => lab.state.find(bot).bot?.status, { timeout: 90_000 }).toBe('joined');
    expect((await page.request.post('/auth/dev', { data: { gamerTag: listener, admin: false } })).ok()).toBe(true);
    await page.goto('/');
    await page.getByRole('button', { name: '参加', exact: true }).click();
    await expect.poll(async () => (await diagnostic(page)).self.status).toBe('joined');
    joined = true;
    expect(await prediction()).toMatchObject({ subscribe: true, volume: 1, step: 11 });
    await expect.poll(async () => (await diagnostic(page)).peers.find(peer => peer.gamerTag === bot)?.subscriptionState).toBe('enabled');
    await expect.poll(async () => (await diagnostic(page)).peers.find(peer => peer.gamerTag === bot)?.voice, { timeout: 15_000 }).toBe(true);
    await action({ action: 'update', name: bot, field: 'location.server', value: 2 });
    expect(await prediction()).toMatchObject({ subscribe: false, volume: 0, step: 3 });
    await expect.poll(async () => (await diagnostic(page)).peers.find(peer => peer.gamerTag === bot)?.receiving).toBe(false);
    await action({ action: 'update', name: bot, field: 'location.server', value: 1 });
    await expect.poll(async () => (await diagnostic(page)).peers.find(peer => peer.gamerTag === bot)?.subscriptionState).toBe('enabled');
    await action({ action: 'update', name: bot, field: 'mute', value: 2 });
    await expect.poll(() => lab.bots.inspect(bot)).toMatchObject({ muted: false, gameMute: 2 });
    await expect.poll(async () => (await diagnostic(page)).peers.find(peer => peer.gamerTag === bot)?.voice, { timeout: 15_000 }).toBe(true);
    await action({ action: 'speaker', name: bot, value: true });
    expect(await prediction()).toMatchObject({ subscribe: true, step: 1 });
    await action({ action: 'speaker', name: bot, value: false });
    expect(await prediction()).toMatchObject({ step: 11 });
  } finally {
    await lab.close();
    try {
      await expect(lab.bots.inspect(bot)).rejects.toThrow('ボット未参加');
      if (joined) await expect.poll(async () => (await diagnostic(page)).peers.some(peer => peer.gamerTag === bot)).toBe(false);
    } finally {
      await page.evaluate(() => (document.querySelector('#__nuxt') as Root).__vue_app__.config.globalProperties.$nuxt.$voice.leave()).catch(() => {});
    }
  }
});
