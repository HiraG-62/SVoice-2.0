import { expect, test, vi } from 'vitest';
import { createBotManager, inspectBot, type BotSession } from '../scripts/voiceLab/bots';
import type { Page } from '@playwright/test';
import { createLabState } from '../scripts/voiceLab/state';
import { buildSpeechScript, createSpeechAudio } from '../scripts/voiceLab/speech';

test('ページのストアからミュートを解除し、Socket の切断を検知', async () => {
  const audio = { muted: true, setMuted: vi.fn((value: boolean) => { audio.muted = value; }) };
  let connected = true;
  const app = { $pinia: { _s: new Map<string, object>([
    ['audio', audio], ['call', { status: 'joined', speaking: false, gamerTag: 'Bot', players: [{ name: 'Bot', mute: 2 }] }],
  ]) }, $voice: { debugSnapshot: () => ({ socket: { connected } }) } };
  vi.stubGlobal('document', { querySelector: () => ({ __vue_app__: { config: { globalProperties: { $nuxt: app } } } }) });
  const page = { evaluate: async (callback: () => unknown) => callback() } as unknown as Page;
  try {
    expect(await inspectBot(page)).toMatchObject({ joined: true, muted: false, gameMute: 2 });
    expect(audio.setMuted).toHaveBeenCalledWith(false);
    connected = false;
    expect((await inspectBot(page)).joined).toBe(false);
  } finally { vi.unstubAllGlobals(); }
});

test('読み上げスクリプトはタグとパスをデータとして扱う', () => {
  const script = buildSpeechScript("Bot'; $(exit) 日本語", "C:\\temp\\a'b.wav");
  expect(script).not.toContain("Bot';");
  expect(script).not.toContain("a'b.wav");
  expect(script).toContain(Buffer.from("Bot'; $(exit) 日本語", 'utf8').toString('base64'));
  expect(script).toContain('48000');
  expect(script).toContain('AppendBreak');
});

test('音声生成に失敗したら既定の wav に切り替える', async () => {
  const audio = await createSpeechAudio('Bot', { run: async () => { throw new Error('失敗'); } });
  expect(audio.path).toMatch(/microphone\.wav$/);
  expect(audio.warning).toBe('読み上げ生成失敗・合成音声');
  await audio.close();
});

test('ボットの参加・ミュート解除・全体発言・再起動・削除・終了', async () => {
  const state = createLabState([], ['Bot1', 'Bot2']);
  const sessions: BotSession[] = [];
  const launch = vi.fn(async (): Promise<BotSession> => {
    const session = { close: vi.fn(async () => {}), speaker: vi.fn(async () => {}),
      inspect: vi.fn(async () => ({ joined: true, speaker: false, muted: false })) };
    sessions.push(session);
    return session;
  });
  const manager = createBotManager(state, launch);
  await manager.start('Bot1');
  expect(state.rows[0].bot?.status).toBe('joined');
  await manager.tick();
  expect(sessions[0].inspect).toHaveBeenCalled();
  await manager.speaker('Bot1', true);
  expect(sessions[0].speaker).toHaveBeenCalledWith(true);
  await manager.restart('Bot1');
  expect(sessions[0].close).toHaveBeenCalledTimes(1);
  await manager.start('Bot2');
  await manager.remove('Bot1');
  expect(sessions[1].close).toHaveBeenCalledTimes(1);
  await manager.close();
  expect(sessions[2].close).toHaveBeenCalledTimes(1);
  expect(state.rows.map(row => row.player.name)).toEqual(['Bot2']);
});

test('切断と起動失敗を行に表示し、終了と起動の競合でも閉じる', async () => {
  const state = createLabState([], ['Bot']);
  const close = vi.fn(async () => {});
  const manager = createBotManager(state, async () => ({ close, speaker: async () => {},
    inspect: async () => ({ joined: false, speaker: false, muted: false }) }));
  await manager.start('Bot');
  await manager.tick();
  expect(state.rows[0].bot).toMatchObject({ status: 'error', speaker: false });
  await manager.close();
  expect(close).toHaveBeenCalledTimes(1);
  let finish!: (session: BotSession) => void;
  const pending = createBotManager(state, () => new Promise(resolve => { finish = resolve; }));
  const starting = pending.start('Bot');
  const closing = pending.close();
  finish({ close, speaker: async () => {}, inspect: async () => ({ joined: true, speaker: false, muted: false }) });
  await Promise.all([starting, closing]);
  expect(close).toHaveBeenCalledTimes(2);
  const failing = createBotManager(state, async () => { throw new Error('開発用ログイン無効'); });
  await failing.start('Bot');
  expect(state.rows[0].bot).toMatchObject({ status: 'error', message: '開発用ログイン無効' });
  await failing.close();
});

test('起動中に削除して同じ名前を追加し直しても、新しいボットが参加', async () => {
  const state = createLabState([], ['Bot']);
  const oldClose = vi.fn(async () => {}), newClose = vi.fn(async () => {});
  const session = (close: () => Promise<void>): BotSession => ({ close, speaker: async () => {},
    inspect: async () => ({ joined: true, speaker: false, muted: false }) });
  let finish!: (value: BotSession) => void;
  const launch = vi.fn(() => Promise.resolve(session(newClose)));
  launch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const manager = createBotManager(state, launch);
  const starting = manager.start('Bot');
  const removing = manager.remove('Bot');
  state.add('Bot', 'bot');
  const replacement = manager.start('Bot');
  finish(session(oldClose));
  await Promise.all([starting, removing, replacement]);
  expect(launch).toHaveBeenCalledTimes(2);
  expect(oldClose).toHaveBeenCalledTimes(1);
  expect(state.rows[0].bot?.status).toBe('joined');
  await manager.close();
  expect(newClose).toHaveBeenCalledTimes(1);
});
