import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { calculateBotIndex, createDiscordApp, loginWithRetry, validateDiscordId, type DiscordMember } from '../src/discordBot';
import { config } from './fixtures';

const id = '123456789012345678';
const endpoints = ['getUserName', 'getJoinRole', 'setJoinRole', 'checkAdminRole', 'setPhoneRole', 'removePhoneRole'];
function setup(nickname: string | null = '[Player1]', roleIds: string[] = [], discordEnabled = true) {
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
  const app = createDiscordApp({ config: { ...config, DISCORD_ENABLED: discordEnabled }, fetchGuild, nextBot, logger: { log: vi.fn(), error: vi.fn() } });
  return { app, member, fetchGuild, nextBot };
}

describe('Discord 内部 API', () => {
  it.each([
    ['getJoinRole', true], ['checkAdminRole', false],
    ['setJoinRole', { success: true }], ['setPhoneRole', { success: true }], ['removePhoneRole', { success: true }],
    ['getUserName', { error: 'discord_unavailable' }],
  ] as const)('Discord 無効時の %s は Discord に問い合わせない', async (endpoint, expected) => {
    const { app, fetchGuild, nextBot } = setup(null, [], false);
    await request(app).get(`/${endpoint}?id=${id}`).set('x-api-secret', config.API_SECRET)
      .expect(endpoint === 'getUserName' ? 503 : 200, JSON.stringify(expected));
    expect(fetchGuild).not.toHaveBeenCalled();
    expect(nextBot).not.toHaveBeenCalled();
  });

  it.each(endpoints)('Discord 無効時も %s の認証・ID を検証する', async (endpoint) => {
    const { app, fetchGuild } = setup(null, [], false);
    await request(app).get(`/${endpoint}?id=${id}`).expect(401);
    await request(app).get(`/${endpoint}?id=${id}`).set('x-api-secret', 'wrong').expect(401);
    await request(app).get(`/${endpoint}?id=invalid`).set('x-api-secret', config.API_SECRET).expect(400);
    await request(app).get(`/${endpoint}`).set('x-api-secret', config.API_SECRET).expect(400);
    expect(fetchGuild).not.toHaveBeenCalled();
  });

  it('Discord 無効時も参加パスワードを照合する', async () => {
    const { app } = setup(null, [], false);
    await request(app).post('/checkJoinPass').send({ pass: config.JOIN_PASSWORD }).expect(401);
    for (const pass of [config.JOIN_PASSWORD, 'wrong']) {
      await request(app).post('/checkJoinPass').set('x-api-secret', config.API_SECRET).send({ pass })
        .expect(200, String(pass === config.JOIN_PASSWORD));
    }
    await request(app).post('/checkJoinPass').set('x-api-secret', config.API_SECRET).send({ pass: 123 }).expect(400);
  });

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

  it.each(['名前だけ', null, '[]'])('ゲーマータグがなければ 422: %s', async (nickname) => {
    const { app } = setup(nickname);
    await request(app).get(`/getUserName?id=${id}`).set('x-api-secret', config.API_SECRET).expect(422, { error: 'nickname_missing' });
  });

  it.each([[10007, 404, 'member_not_found'], [50013, 500, 'internal_error']] as const)('メンバー取得失敗 %s を区別し、ID は末尾だけ記録する', async (code, status, error) => {
    const log = vi.fn();
    const app = createDiscordApp({ config, fetchGuild: async () => ({ members: { fetch: async () => { throw { code }; } } }), nextBot: vi.fn(), logger: { log, error: vi.fn() } });
    await request(app).get(`/getUserName?id=${id}`).set('x-api-secret', config.API_SECRET).expect(status, { error });
    expect(log).toHaveBeenCalledWith(expect.stringContaining(id.slice(-4)));
    expect(log.mock.calls.flat().join()).not.toContain(id);
  });

  it('内部 API は許可外 IP を拒否し、CORS を公開しない', async () => {
    const app = createDiscordApp({ config: { ...config, INTERNAL_API_ALLOWED_IPS: ['192.0.2.1'] }, fetchGuild: vi.fn(), nextBot: vi.fn() });
    await request(app).get(`/getJoinRole?id=${id}`).set('x-api-secret', config.API_SECRET).set('X-Forwarded-For', '192.0.2.1').expect(403);
    const response = await request(setup().app).get(`/getJoinRole?id=${id}`).set('x-api-secret', config.API_SECRET).set('Origin', config.SERVER_URL!);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
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
