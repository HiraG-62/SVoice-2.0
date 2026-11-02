import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGameReceiver, validatePlayerData } from '../src/gameReceiver';
import { player } from './fixtures';

const receivers: ReturnType<typeof createGameReceiver>[] = [];
const createReceiver = (secret?: string) => {
  const receiver = createGameReceiver({ gameApiSecret: secret });
  receivers.push(receiver);
  return receiver;
};

afterEach(() => {
  receivers.splice(0).forEach((receiver) => receiver.dispose());
  vi.useRealTimers();
});

describe('gameReceiver', () => {
  it('許可外 IP と偽の転送ヘッダーを拒否する', async () => {
    const receiver = createGameReceiver({ allowedIps: ['192.0.2.1'], logger: { log: vi.fn() } });
    receivers.push(receiver);
    await request(receiver.app).post('/').set('X-Forwarded-For', '192.0.2.1').send([player]).expect(403);
    expect(receiver.getData()).toBeUndefined();
  });

  it('* は送信元制限を外す', async () => {
    const receiver = createGameReceiver({ allowedIps: ['*'] });
    receivers.push(receiver);
    await request(receiver.app).post('/').send([player]).expect(200);
  });

  it('不正 JSON も 400 にし、理由のログを 1 分に 1 回へ抑える', async () => {
    const log = vi.fn();
    const receiver = createGameReceiver({ logger: { log } });
    receivers.push(receiver);
    for (let i = 0; i < 2; i++) await request(receiver.app).post('/').set('Content-Type', 'application/json').send('{').expect(400);
    expect(log).toHaveBeenCalledTimes(1);
    expect(receiver.getData()).toBeUndefined();
  });

  it.each([true, false, '1', '-1.5', '1e2', 0, 0.5])('有限数・真偽値・数値文字列を変換せず受け取る: %s', async (value) => {
    const receiver = createReceiver();
    const players = [{ ...player, x: value }];
    await request(receiver.app).post('/').send(players).expect(200);
    expect(receiver.getData()).toEqual(players);
  });

  it.each([{}, [], null, '', ' ', 'NaN', 'Infinity', Number.NaN, Infinity])('不正なフィールド値を拒否する: %j', (value) => {
    expect(validatePlayerData([{ ...player, x: value }])).toBe(false);
  });

  it('500 人まで受け付ける', () => {
    expect(validatePlayerData(Array.from({ length: 500 }, () => player))).toBe(true);
    expect(validatePlayerData(Array.from({ length: 501 }, () => player))).toBe(false);
  });

  it('受信拒否・形式不正のログをそれぞれ 1 分に 1 回へ抑える', async () => {
    let now = 0;
    const log = vi.fn();
    const receiver = createGameReceiver({ allowedIps: [], now: () => now, logger: { log } });
    receivers.push(receiver);
    for (let i = 0; i < 2; i++) await request(receiver.app).post('/').send([]).expect(403);
    expect(log).toHaveBeenCalledTimes(1);
    now = 60_000;
    await request(receiver.app).post('/').send([]).expect(403);
    expect(log).toHaveBeenCalledTimes(2);
    const invalid = createGameReceiver({ logger: { log }, now: () => now });
    receivers.push(invalid);
    for (let i = 0; i < 2; i++) await request(invalid.app).post('/').send([{}]).expect(400);
    expect(log).toHaveBeenCalledTimes(3);
  });

  it('拒否したリクエストで受信期限を延ばさない', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const receiver = createReceiver('secret');
    await request(receiver.app).post('/').set('x-api-secret', 'secret').send([player]).expect(200);
    vi.advanceTimersByTime(4000);
    await request(receiver.app).post('/').send([player]).expect(401);
    vi.advanceTimersByTime(1000);
    expect(receiver.getData()).toBeNull();
  });

  it('未定義のデータを拒否する', () => {
    expect(validatePlayerData(undefined)).toBe(false);
  });

  it.each([
    { players: [] }, { players: [player] }, { players: [player, { ...player, name: 'Player2' }] },
  ])('正しいデータで 200: $players', async ({ players }) => {
    const receiver = createReceiver();
    await request(receiver.app).post('/').send(players).expect(200, { success: true });
    expect(receiver.getData()).toEqual(players);
  });

  it.each([{}, 'not an array', null, 123, [{ name: 'Player1' }], [{ ...player, name: '' }], [null]])('形式違いで 400: %j', async (body) => {
    const receiver = createReceiver();
    await request(receiver.app).post('/').set('Content-Type', 'application/json').send(JSON.stringify(body)).expect(400);
  });

  it.each([undefined, 'wrong', 'secret'])('GAME_API_SECRET の認証: %s', async (secret) => {
    const receiver = createReceiver('secret');
    const req = request(receiver.app).post('/').send([player]);
    if (secret) req.set('x-api-secret', secret);
    await req.expect(secret === 'secret' ? 200 : 401);
  });

  it('最後のリクエストから 5 秒後にデータをクリアする', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const receiver = createReceiver();
    await request(receiver.app).post('/').send([player]).expect(200);
    vi.advanceTimersByTime(4_000);
    await request(receiver.app).post('/').send([player]).expect(200);
    vi.advanceTimersByTime(4_999);
    expect(receiver.getData()).toEqual([player]);
    vi.advanceTimersByTime(1);
    expect(receiver.getData()).toBeNull();
  });
});
