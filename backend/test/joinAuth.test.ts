import { mkdtempSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDiscordApp } from '../src/internalApi';
import { createJoinLockStore } from '../src/joinLockStore';
import { config } from './fixtures';

const id = '123456789012345678';
let directory: string;
beforeEach(() => { directory = mkdtempSync(path.join(tmpdir(), 'svoice-lock-test-')); });
afterEach(() => {
  for (const file of readdirSync(directory)) unlinkSync(path.join(directory, file));
  rmdirSync(directory);
});

function setup(enabled = false) {
  const add = vi.fn(async () => {});
  const fetchGuild = vi.fn(async () => ({ members: { fetch: async () => ({ nickname: '[Player]', roles: { cache: new Set<string>(), add, remove: async () => {} } }) } }));
  const app = createDiscordApp({ config: { ...config, DATA_DIR: directory, DISCORD_ENABLED: enabled }, fetchGuild, nextBot: vi.fn(), logger: { log: vi.fn(), error: vi.fn() } });
  const auth = (pass: string, userId = id) => request(app).post('/joinAuth').set('x-api-secret', config.API_SECRET).send({ id: userId, gamerTag: 'Player', pass });
  return { app, auth, add, fetchGuild };
}

describe('参加認証と永続ロック', () => {
  it('成功時だけロールを付与し、失敗回数をリセットする', async () => {
    const { auth, add } = setup(true);
    await auth('wrong').expect(200, { ok: false, locked: false, remaining: 4 });
    expect(add).not.toHaveBeenCalled();
    await auth(config.JOIN_PASSWORD).expect(200, { ok: true, locked: false, remaining: 5 });
    expect(add).toHaveBeenCalledWith('join');
    await auth('wrong').expect(200, { ok: false, locked: false, remaining: 4 });
  });

  it('5 回でロックし、ストア再作成・正しいパスワードでも解除されない', async () => {
    const { auth, app, fetchGuild } = setup();
    for (let failures = 1; failures <= 5; failures++) {
      await auth('wrong').expect(200, { ok: false, locked: failures === 5, remaining: 5 - failures });
    }
    const store = createJoinLockStore(path.join(directory, 'join-locks.json'));
    expect(store.list()).toEqual([{ id, gamerTag: 'Player', failures: 5, lockedAt: expect.any(String) }]);
    const restarted = setup();
    await restarted.auth(config.JOIN_PASSWORD).expect(200, { ok: false, locked: true, remaining: 0 });
    await request(app).get('/joinLocks').set('x-api-secret', config.API_SECRET).expect(200, store.list());
    await request(app).post('/unlockJoin').set('x-api-secret', config.API_SECRET).send({ id }).expect(200, { success: true });
    await request(app).get('/joinLocks').set('x-api-secret', config.API_SECRET).expect(200, []);
    await auth(config.JOIN_PASSWORD).expect(200, { ok: true, locked: false, remaining: 5 });
    expect(fetchGuild).not.toHaveBeenCalled();
    expect(createJoinLockStore(path.join(directory, 'join-locks.json')).list()).toEqual([]);
  });

  it('アカウントごとに回数を分け、並行要求も取りこぼさない', async () => {
    const { auth } = setup();
    const results = await Promise.all(Array.from({ length: 6 }, () => auth('wrong')));
    expect(results.map((result) => result.body.remaining)).toEqual([4, 3, 2, 1, 0, 0]);
    await auth('wrong', '223456789012345678').expect(200, { ok: false, locked: false, remaining: 4 });
  });

  it('管理エンドポイントにも秘密鍵と本文検証が必要', async () => {
    const { app } = setup();
    await request(app).get('/joinLocks').expect(401);
    await request(app).post('/unlockJoin').send({ id }).expect(401);
    await request(app).post('/joinAuth').send({ id, gamerTag: 'Player', pass: 'wrong' }).expect(401);
    for (const body of [{}, { id, gamerTag: '', pass: 'wrong' }, { id, gamerTag: 'Player', pass: 1 }, { id: 'bad', gamerTag: 'Player', pass: 'wrong' }]) {
      await request(app).post('/joinAuth').set('x-api-secret', config.API_SECRET).send(body).expect(400);
    }
    await request(app).post('/unlockJoin').set('x-api-secret', config.API_SECRET).send({ id: 'bad' }).expect(400);
  });

  it('ロール付与の失敗を成功として返さない', async () => {
    const { auth, add } = setup(true);
    add.mockRejectedValue(new Error('failed'));
    await auth(config.JOIN_PASSWORD).expect(500);
  });
});
