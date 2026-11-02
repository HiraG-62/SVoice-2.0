import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { calculateBotIndex, createDiscordApp, loginWithRetry, validateDiscordId, type DiscordMember } from '../src/discordBot';
import { config } from './fixtures';

const id = '123456789012345678';
const endpoints = ['getUserName', 'getJoinRole', 'setJoinRole', 'checkAdminRole', 'setPhoneRole', 'removePhoneRole'];
function setup(nickname: string | null = '[Player1]', roleIds: string[] = []) {
  const roles = new Set(roleIds);
  const member: DiscordMember = {
    nickname,
    roles: {
      cache: roles,
      add: vi.fn(async (role: string) => { roles.add(role); }),
      remove: vi.fn(async (role: string) => { roles.delete(role); }),
    },
  };
  const fetchGuild = vi.fn(async () => ({ members: { fetch: vi.fn(async () => member) } }));
  const nextBot = vi.fn();
  const app = createDiscordApp({ config, fetchGuild, nextBot, logger: { log: vi.fn(), error: vi.fn() } });
  return { app, member, fetchGuild, nextBot };
}

describe('Discord 内部 API', () => {
  it.each([null, undefined, 12345678901234567])('文字列以外の ID を拒否する: %s', (invalid) => {
    expect(validateDiscordId(invalid)).toBe(false);
  });

  it.each([...endpoints, 'checkJoinPass'])('%s で未認証・不一致を拒否する', async (endpoint) => {
    const { app, fetchGuild } = setup();
    for (const secret of [undefined, 'wrong']) {
      const req = endpoint === 'checkJoinPass' ? request(app).post(`/${endpoint}`).send({ pass: 'test-password' }) : request(app).get(`/${endpoint}?id=${id}`);
      if (secret) req.set('x-api-secret', secret);
      await req.expect(401, { error: 'Unauthorized' });
    }
    expect(fetchGuild).not.toHaveBeenCalled();
  });

  it.each(endpoints)('%s で不正な ID を拒否する', async (endpoint) => {
    const { app, fetchGuild } = setup();
    for (const invalid of ['', 'undefined', '1234567890123456', '123456789012345678901', 'abcdefghijklmnopq', '1234-5678-9012-3456']) {
      await request(app).get(`/${endpoint}?id=${invalid}`).set('x-api-secret', config.API_SECRET).expect(400, { error: 'Invalid Discord ID' });
    }
    expect(fetchGuild).not.toHaveBeenCalled();
  });

  it.each(['12345678901234567', id, '1234567890123456789', '12345678901234567890'])('有効な ID %s でニックネームを返す', async (userId) => {
    const { app, nextBot } = setup('名前 [Player One]');
    await request(app).get(`/getUserName?id=${userId}`).set('x-api-secret', config.API_SECRET).expect(200, '"Player One"');
    expect(nextBot).toHaveBeenCalledOnce();
  });

  it.each(['名前だけ', null, '[]'])('ゲーマータグがなければ 500: %s', async (nickname) => {
    const { app } = setup(nickname);
    await request(app).get(`/getUserName?id=${id}`).set('x-api-secret', config.API_SECRET).expect(500, { error: 'Discord name inconsistency error' });
  });

  it.each([{ pass: 'test-password', expected: true }, { pass: 'wrong', expected: false }])('参加パスワードを照合する: $expected', async ({ pass, expected }) => {
    await request(setup().app).post('/checkJoinPass').set('x-api-secret', config.API_SECRET).send({ pass }).expect(200, String(expected));
  });

  it.each([{}, { pass: 123 }, { pass: null }])('文字列以外のパスワードを拒否する: %j', async (body) => {
    await request(setup().app).post('/checkJoinPass').set('x-api-secret', config.API_SECRET).send(body).expect(400);
  });

  it.each(['getJoinRole', 'checkAdminRole'])('%s でロールの有無を返す', async (endpoint) => {
    for (const roleIds of [[], ['join', 'admin']]) {
      await request(setup('[Player1]', roleIds).app).get(`/${endpoint}?id=${id}`).set('x-api-secret', config.API_SECRET).expect(200, String(roleIds.length > 0));
    }
  });

  it.each([{ endpoint: 'setJoinRole', role: 'join' }, { endpoint: 'setPhoneRole', role: 'phone' }])('$endpoint はロールがない場合だけ付与する', async ({ endpoint, role }) => {
    for (const existing of [false, true]) {
      const { app, member } = setup('[Player1]', existing ? [role] : []);
      await request(app).get(`/${endpoint}?id=${id}`).set('x-api-secret', config.API_SECRET).expect(200, { success: true });
      expect(member.roles.add).toHaveBeenCalledTimes(existing ? 0 : 1);
      if (!existing) expect(member.roles.add).toHaveBeenCalledWith(role);
    }
  });

  it('removePhoneRole はロールがある場合だけ解除する', async () => {
    for (const existing of [false, true]) {
      const { app, member } = setup('[Player1]', existing ? ['phone'] : []);
      await request(app).get(`/removePhoneRole?id=${id}`).set('x-api-secret', config.API_SECRET).expect(200, { success: true });
      expect(member.roles.remove).toHaveBeenCalledTimes(existing ? 1 : 0);
      if (existing) expect(member.roles.remove).toHaveBeenCalledWith('phone');
    }
  });
});

describe('人数表示 Bot の番号', () => {
  it.each([
    [0, 22, 0], [5, 22, 5], [20, 22, 20], [100, 22, 20],
    [0, 10, 0], [5, 10, 5], [15, 10, 9], [20, 10, 9], [0, 1, 0], [10, 1, 0],
  ])('%i 人・Bot %i 体では %i 番', (players, bots, expected) => {
    expect(calculateBotIndex(players, bots)).toBe(expected);
  });
});

describe('Bot ログイン', () => {
  it('失敗は最大 5 回で終了する', async () => {
    const login = vi.fn().mockRejectedValue(new Error('login failed'));
    const wait = vi.fn(async () => {});
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    await expect(loginWithRetry({ login }, 'dummy', 0, { wait, logger })).resolves.toBe(false);
    expect(login).toHaveBeenCalledTimes(5);
    expect(wait).toHaveBeenCalledTimes(5);
  });
});
