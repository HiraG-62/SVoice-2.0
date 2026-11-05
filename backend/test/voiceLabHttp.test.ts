import { afterEach, expect, test, vi } from 'vitest';
import { createLabState } from '../scripts/voiceLab/state';
import { createBotManager } from '../scripts/voiceLab/bots';
import { listenLab } from '../scripts/voiceLab/server';

const closers: (() => Promise<void>)[] = [];
afterEach(async () => { await Promise.all(closers.splice(0).map(close => close())); });

test('loopback の操作画面・状態・全 API と入力検証', async () => {
  const state = createLabState(['Alice'], []);
  const launch = vi.fn(async () => ({ close: async () => {}, speaker: async () => {},
    inspect: async () => ({ joined: true, speaker: false, muted: false }) }));
  const bots = createBotManager(state, launch);
  const server = await listenLab({ state, bots, settings: () => null, startBot: name => bots.start(name) }, 0);
  closers.push(server.close, bots.close);
  expect(server.address.address).toBe('127.0.0.1');
  const action = (body: unknown) => fetch(`${server.url}/api/action`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  expect((await fetch(server.url)).status).toBe(200);
  expect((await fetch(`${server.url}/api/state`)).status).toBe(200);
  expect((await action({ action: 'add', name: 'Bot', kind: 'bot' })).status).toBe(200);
  expect((await action({ action: 'update', name: 'Bot', field: 'radio.type', value: 9.5 })).status).toBe(200);
  expect(state.find('Bot').player.radio.type).toBe(9.5);
  for (const body of [
    { action: 'add', name: 'Alice', kind: 'bot' }, { action: 'add', name: '', kind: 'bot' },
    { action: 'add', name: 'X', kind: 'admin' }, { action: 'update', name: 'Bot', field: 'name', value: 1 },
    { action: 'update', name: 'Bot', field: 'music', value: 'Infinity' },
    { action: 'include', name: 'Bot', value: 'false' }, { action: 'sending', value: null },
    { action: 'listener', name: '不在' }, { action: 'noSuchAction' },
  ]) expect((await action(body)).status).toBe(400);
  expect((await action({ action: 'include', name: 'Bot', value: false })).status).toBe(200);
  expect(state.players()).toHaveLength(1);
  expect((await action({ action: 'listener', name: 'Bot' })).status).toBe(200);
  expect((await action({ action: 'speaker', name: 'Bot', value: true })).status).toBe(200);
  expect((await action({ action: 'restart', name: 'Bot' })).status).toBe(200);
  expect((await action({ action: 'sending', value: false })).status).toBe(200);
  expect((await action({ action: 'remove', name: 'Bot' })).status).toBe(200);
  expect(state.rows).toHaveLength(1);
  expect((await fetch(`${server.url}/api/unknown`)).status).toBe(404);
  expect((await fetch(`${server.url}/api/action`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' })).status).toBe(400);
  expect((await fetch(`${server.url}/api/action`, { method: 'POST', headers: {
    'content-type': 'application/json', origin: 'https://example.com',
  }, body: JSON.stringify({ action: 'sending', value: true }) })).status).toBe(403);
});
