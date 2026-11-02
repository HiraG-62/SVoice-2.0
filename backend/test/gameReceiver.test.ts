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
