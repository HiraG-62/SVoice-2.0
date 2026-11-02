import { expect, test, type Page } from '@playwright/test';
import { createPlayer, placeAtDistance, resolveFakeGameEndpoint } from '../backend/scripts/fakeGame';
import { loadEnvironment } from '../backend/src/config';

const env: NodeJS.ProcessEnv = { ENV_FILE: '.env.development' };
loadEnvironment(env);
const endpoint = resolveFakeGameEndpoint(env);

import fs from 'node:fs';
import path from 'node:path';
import type { IngameSettings, PlayerData } from '../packages/shared/src';
import { parseDebugRecords } from '../backend/scripts/debugLog';
import { resolveBackendPath } from '../backend/src/config';
import type { useCallStore } from '../frontend/stores/call';
import type { useAudioStore } from '../frontend/stores/audio';
import type { createVoiceSession } from '../frontend/composables/useVoice';

type Voice = ReturnType<typeof createVoiceSession>;
type Root = Element & { __vue_app__: { config: { globalProperties: { $nuxt: {
  $pinia: { state: { value: { call: ReturnType<typeof useCallStore>; audio: ReturnType<typeof useAudioStore> } };
    _s: Map<string, object> };
  isHydrating: boolean;
  $voice: Voice;
  $voiceSocket: { changeSetting(): void };
} } } } };
async function snapshot(page: Page) {
  return page.evaluate(() => {
    const app = (document.querySelector('#__nuxt') as Root).__vue_app__.config.globalProperties.$nuxt;
    const { call, audio } = app.$pinia.state.value;
    return { joined: call.status === 'joined', inGame: call.inGame, gamerTag: call.gamerTag,
      users: call.users, nearby: call.nearby, muted: audio.muted };
  });
}
async function diagnostic(page: Page) {
  return page.evaluate(() => (document.querySelector('#__nuxt') as Root).__vue_app__.config.globalProperties.$nuxt.$voice.debugSnapshot());
}
async function action(page: Page, store: string, method: string, ...args: unknown[]) {
  await page.evaluate(({ store, method, args }) => {
    const instance = (document.querySelector('#__nuxt') as Root).__vue_app__.config.globalProperties.$nuxt.$pinia._s.get(store)! as Record<string, (...args: unknown[]) => unknown>;
    return instance[method]!(...args);
  }, { store, method, args });
}
async function leave(page: Page) {
  await page.evaluate(() => (document.querySelector('#__nuxt') as Root).__vue_app__.config.globalProperties.$nuxt.$voice.leave()).catch(() => {});
}

test('参加・距離・通話・ディメンション・メガホン・ミュート・退出', async ({ browser }) => {
  const aliceContext = await browser.newContext({ permissions: ['microphone'] });
  const bobContext = await browser.newContext({ permissions: ['microphone'] });
  const alice = await aliceContext.newPage(), bob = await bobContext.newPage();
  const aliceTag = `E2E-Alice-${Date.now()}`, bobTag = `E2E-Bob-${Date.now()}`;
  let players: PlayerData[] = [createPlayer(aliceTag), createPlayer(bobTag)];
  let sending = true;
  let senderError = false;
  let originalSettings: IngameSettings | undefined;
  const send = async () => {
    if (!sending) return;
    const response = await fetch(endpoint, { method: 'POST', headers: {
      'content-type': 'application/json', ...(env.GAME_API_SECRET ? { 'x-api-secret': env.GAME_API_SECRET } : {}),
    }, body: JSON.stringify(players) });
    expect(response.ok).toBe(true);
  };
  const sender = setInterval(() => { void send().catch(() => { senderError = true; }); }, 200);
  try {
    for (const [page, tag, admin] of [[alice, aliceTag, true], [bob, bobTag, false]] as const) {
      const login = await page.request.post('http://localhost:3100/auth/dev', { data: { gamerTag: tag, admin } });
      expect(login.ok()).toBe(true);
      await page.goto('http://localhost:3100/');
      await page.getByRole('button', { name: '参加', exact: true }).click();
      await expect.poll(async () => (await snapshot(page)).joined).toBe(true);
    }
    await expect.poll(async () => (await snapshot(alice)).inGame).toBe(true);
    await expect.poll(async () => (await snapshot(alice)).users).toEqual([{ gamerTag: bobTag, gain: 1 }]);
    for (const [distance, gain] of [[3, 2], [12, 16 / 15], [25, 0]]) {
      players = placeAtDistance(players, distance!);
      if (!gain) await expect.poll(async () => (await snapshot(alice)).nearby).toEqual([]);
      else await expect.poll(async () => ((await snapshot(alice)).nearby as {currentGain:number}[])?.[0]?.currentGain).toBeCloseTo(gain!, 5);
    }
    players = players.map(p => ({ ...p, telephone: 1, x: p.name === bobTag ? 100 : 0 }));
    await expect.poll(async () => ((await snapshot(alice)).nearby as {currentGain:number}[])?.[0]?.currentGain).toBe(2);
    players = players.map(p => ({ ...p, telephone: 0, x: 0, dimension: p.name === bobTag ? 1 : 0 }));
    await expect.poll(async () => (await snapshot(alice)).nearby).toEqual([]);
    players[1] = { ...players[1]!, dimension: 0, x: 25, useMegaphone: 1 };
    await expect.poll(async () => ((await snapshot(alice)).nearby as {currentGain:number}[])?.[0]?.currentGain).toBeCloseTo(2.2 * 5 / 22.5, 5);
    players[0]!.mute = 2;
    await expect.poll(async () => (await snapshot(alice)).muted).toBe(true);
    players[0]!.mute = 3;
    await expect.poll(async () => (await snapshot(alice)).muted).toBe(false);
    players = [createPlayer(aliceTag), { ...createPlayer(bobTag), x: 3 }];
    await bob.locator('.mdi-waveform').click();
    await expect.poll(async () => (await snapshot(alice)).nearby[0]?.voice).toBe(true);
    await bob.locator('.mdi-waveform').click();
    await alice.locator('.mdi-microphone').first().click();
    await expect.poll(async () => (await diagnostic(alice)).self.micGain).toBe(0);
    await action(alice, 'audio', 'setMicLevel', 150);
    expect((await diagnostic(alice)).self.micGain).toBe(0);
    await alice.locator('.mdi-microphone-off').first().click();
    await expect.poll(async () => (await diagnostic(alice)).self.micGain).toBe(3);
    await action(alice, 'audio', 'setMicLevel', 100);
    await action(alice, 'audio', 'setPhoneLevel', 50);
    await expect.poll(async () => (await snapshot(alice)).nearby[0]?.currentGain).toBe(1);
    await action(alice, 'call', 'setUserGain', bobTag, .5);
    await expect.poll(async () => (await snapshot(alice)).nearby[0]?.currentGain).toBe(.5);
    await action(alice, 'call', 'setUserGain', bobTag, 1);
    await action(alice, 'audio', 'setPhoneLevel', 100);

    originalSettings = await (await alice.request.get('/api/getSetting')).json();
    const modified = structuredClone(originalSettings!);
    modified.general.value.maxDistance.value += 1;
    expect((await bob.request.post('/api/setSetting', { data: modified })).status()).toBe(403);
    expect((await alice.request.post('/api/setSetting', { data: modified })).ok()).toBe(true);
    await alice.evaluate(() => (document.querySelector('#__nuxt') as Root).__vue_app__.config.globalProperties.$nuxt.$voiceSocket.changeSetting());
    await expect.poll(async () => bob.evaluate(() => ((document.querySelector('#__nuxt') as Root).__vue_app__.config.globalProperties.$nuxt.$pinia._s.get('settings') as { value: IngameSettings | null }).value?.general.value.maxDistance.value))
      .toBe(modified.general.value.maxDistance.value);
    expect((await alice.request.post('/api/setSetting', { data: originalSettings })).ok()).toBe(true);
    await action(alice, 'settings', 'replace', null);
    await action(bob, 'settings', 'replace', null);
    await expect.poll(async () => (await snapshot(alice)).nearby[0]?.currentGain).toBe(2);

    sending = false;
    await expect.poll(async () => (await snapshot(alice)).inGame).toBe(false);
    await expect.poll(async () => (await snapshot(alice)).nearby).toEqual([]);
    await alice.locator('.mdi-bullhorn').click();
    await expect.poll(async () => (await snapshot(bob)).nearby[0]?.currentGain).toBe(2);
    await alice.locator('.mdi-bullhorn').click();
    await expect.poll(async () => (await snapshot(bob)).nearby).toEqual([]);
    sending = true;
    await send();
    await expect.poll(async () => (await snapshot(alice)).inGame).toBe(true);

    const locksBefore = await (await alice.request.get('/api/admin/joinLocks')).json() as { id: string; gamerTag: string }[];
    for (let i = 0; i < 5; i++) {
      const response = await bob.request.post('/api/joinAuth', { data: { pass: `e2e-wrong-${Date.now()}` } });
      const result = await response.json() as { locked: boolean };
      expect(result.locked).toBe(i === 4);
    }
    const locks = await (await alice.request.get('/api/admin/joinLocks')).json() as { id: string; gamerTag: string }[];
    const lock = locks.find(value => value.gamerTag === bobTag)!;
    expect(lock).toBeDefined();
    expect((await bob.request.get('/api/admin/joinLocks')).status()).toBe(403);
    expect((await alice.request.post('/api/admin/unlockJoin', { data: { id: lock.id } })).ok()).toBe(true);
    expect((await (await alice.request.get('/api/admin/joinLocks')).json()).length).toBe(locksBefore.length);

    await alice.getByRole('tab', { name: '全てのプレイヤー' }).click();
    await alice.locator('.v-data-table').nth(1).getByText(bobTag, { exact: true }).click();
    expect(await alice.getByRole('dialog').count()).toBe(1);
    await alice.getByRole('button', { name: '確認', exact: true }).click();
    await expect.poll(async () => (await snapshot(bob)).joined).toBe(false);
    for (let cycle = 0; cycle < 3; cycle++) {
      await bob.getByRole('button', { name: '参加', exact: true }).click();
      await expect.poll(async () => (await snapshot(bob)).joined).toBe(true);
      await expect.poll(async () => (await snapshot(alice)).users.length).toBe(1);
      await expect.poll(async () => (await diagnostic(bob)).resources).toEqual({ receivers: 1, subscriptions: 1, syncTimers: 1, audioGraphs: 1 });
      expect((await diagnostic(bob)).socket.listeners).toBe(7);
      await bob.locator('.mdi-phone-off').click();
      await expect.poll(async () => (await diagnostic(bob)).resources).toEqual({ receivers: 0, subscriptions: 0, syncTimers: 0, audioGraphs: 0 });
      expect((await diagnostic(bob)).socket.listeners).toBe(0);
    }
    const directory = path.join(resolveBackendPath(env.DATA_DIR ?? '.'), 'logs');
    await alice.locator('.mdi-cog').click();
    await alice.getByRole('tab', { name: '一般', exact: true }).click();
    await alice.getByRole('button', { name: '送信', exact: true }).click();
    await expect.poll(() => fs.existsSync(directory) && fs.readdirSync(directory).some(file =>
      file.endsWith('.jsonl') && parseDebugRecords(fs.readFileSync(path.join(directory, file), 'utf8'), aliceTag).length > 0)).toBe(true);
    expect(senderError).toBe(false);
    await expect.poll(async () => (await snapshot(bob)).joined).toBe(false);
    await expect.poll(async () => (await snapshot(alice)).users).toEqual([]);
  } catch (error) {
    console.log('画面状態', await snapshot(alice));
    console.log('音声診断', await diagnostic(alice));
    throw error;
  } finally {
    clearInterval(sender);
    if (originalSettings) await alice.request.post('/api/setSetting', { data: originalSettings });
    await Promise.all([alice, bob].map(leave));
    await Promise.all([aliceContext.close(), bobContext.close()]);
  }
});

test('未ログインではマイクと参加ロールを取得しない', async ({ page }) => {
  let roleRequests = 0;
  await page.route('**/api/getJoinRole', route => { roleRequests++; return route.continue(); });
  await page.addInitScript(() => {
    const state = window as unknown as { micRequests: number };
    state.micRequests = 0;
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: () => { state.micRequests++; throw new Error('未ログインのマイク取得'); } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '開発用ログイン' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (document.querySelector('#__nuxt') as Root).__vue_app__?.config.globalProperties.$nuxt.isHydrating)).toBe(false);
  expect(roleRequests).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { micRequests: number }).micRequests)).toBe(0);
});

for (const [stage, message] of [
  ['mic', 'マイクを利用不可'], ['token', '音声トークンの取得失敗'],
  ['room', '音声ルームへの参加失敗'], ['socket', 'Socket の接続失敗'],
] as const) {
  test(`参加失敗の表示: ${stage}`, async ({ page }) => {
    if (stage === 'mic') await page.addInitScript(() => {
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => { throw new Error('マイクなし'); } });
    });
    if (stage === 'token') await page.route('**/api/skywayToken', route => route.fulfill({ status: 503, json: {} }));
    if (stage === 'room') await page.route('**/api/skywayToken', route => route.fulfill({ json: { token: 'invalid', roomName: 'invalid', memberName: 'invalid' } }));
    if (stage === 'socket') await page.route('**/api/socketToken', route => route.fulfill({ status: 503, json: {} }));
    await page.request.post('/auth/dev', { data: { gamerTag: `E2E-${stage}-${Date.now()}`, admin: false } });
    try {
      await page.goto('/');
      await page.getByRole('button', { name: '参加', exact: true }).click();
      await expect(page.getByText(`※${message}`, { exact: true })).toBeVisible();
      expect((await snapshot(page)).joined).toBe(false);
      expect((await diagnostic(page)).resources.receivers).toBe(0);
    } finally { await leave(page); }
  });
}
