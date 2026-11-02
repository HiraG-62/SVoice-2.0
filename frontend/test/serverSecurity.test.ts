import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { H3Event } from 'h3';
import { verifySocketToken } from '@svoice/shared/socket-token';
import { issueSkywayToken } from '../server/utils/skywayToken';
import defaults from '../settings/default.json';

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  readBody: (event: unknown) => readBody(event),
}));
vi.mock('node:fs', () => ({ default: { writeFileSync: vi.fn() } }));
vi.mock('../server/utils/settingStore', () => ({ getSettingStore: () => ({ file: 'unused-setting.json' }) }));

const user = { discordId: '123456789012345678', gamerTag: 'Alice Bob', discordAuth: false, devLogin: true };
const fetchBackend = vi.fn();
const getSession = vi.fn();
const readBody = vi.fn();
const event = {} as H3Event;
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler);
vi.stubGlobal('getUserSession', getSession);
vi.stubGlobal('useRuntimeConfig', () => ({ apiSecret: 'test-api-secret', public: { server: { api: { url: 'http://backend' } } } }));
vi.stubGlobal('$fetch', fetchBackend);
vi.stubGlobal('readBody', readBody);
vi.stubGlobal('createError', (input: { statusCode: number }) => Object.assign(new Error(String(input.statusCode)), input));

const { default: getJoinRole } = await import('../server/api/getJoinRole.get');
const { default: setPhoneRole } = await import('../server/api/setPhoneRole.get');
const { default: removePhoneRole } = await import('../server/api/removePhoneRole.get');
const { default: joinAuth } = await import('../server/api/joinAuth.post');
const { default: socketToken } = await import('../server/api/socketToken.get');
const { default: joinLocks } = await import('../server/api/admin/joinLocks.get');
const { default: unlockJoin } = await import('../server/api/admin/unlockJoin.post');
const { default: setSetting } = await import('../server/api/setSetting');
const { default: skywayToken } = await import('../server/api/skywayToken.get');
const { default: fs } = await import('node:fs');

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user });
});

describe('セッションに基づく API', () => {
  it.each([getJoinRole, setPhoneRole, removePhoneRole])('ロール操作はセッションの ID を使う', async handler => {
    await handler(event);
    expect(fetchBackend).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ query: { id: user.discordId } }));
  });
  it.each([getJoinRole, setPhoneRole, removePhoneRole, joinAuth, socketToken, joinLocks, unlockJoin, setSetting, skywayToken])('未ログインは 401', async handler => {
    getSession.mockResolvedValue({});
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 401 });
    expect(fetchBackend).not.toHaveBeenCalled();
  });
  it.each([
    { ok: true, locked: false, remaining: 5 },
    { ok: false, locked: false, remaining: 4 },
    { ok: false, locked: true, remaining: 0 },
  ])('参加認証は入力の ID とタグを使わず結果を中継する: %j', async result => {
    readBody.mockResolvedValue({ pass: 'wrong', id: '999999999999999999', gamerTag: 'Mallory' });
    fetchBackend.mockResolvedValue(result);
    expect(await joinAuth(event)).toEqual(result);
    expect(fetchBackend).toHaveBeenCalledWith('http://backend/joinAuth', expect.objectContaining({ body: { pass: 'wrong', id: user.discordId, gamerTag: user.gamerTag } }));
  });
  it.each([null, {}, { pass: 123 }])('不正な参加パスワードは 400: %j', async body => {
    readBody.mockResolvedValue(body);
    await expect(joinAuth(event)).rejects.toMatchObject({ statusCode: 400 });
    expect(fetchBackend).not.toHaveBeenCalled();
  });
  it.each([joinLocks, unlockJoin, setSetting])('一般ユーザーの管理 API を拒否する', async handler => {
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 403 });
    expect(fetchBackend).not.toHaveBeenCalled();
  });
  it('管理者はロックの一覧と解除を中継できる', async () => {
    getSession.mockResolvedValue({ user: { ...user, discordAuth: true } });
    fetchBackend.mockResolvedValue([]);
    expect(await joinLocks(event)).toEqual([]);
    readBody.mockResolvedValue({ id: '999999999999999999' });
    await unlockJoin(event);
    expect(fetchBackend).toHaveBeenLastCalledWith('http://backend/unlockJoin', expect.objectContaining({ body: { id: '999999999999999999' } }));
  });
  it('Socket トークンは本人の情報と 60 秒の期限を含む', async () => {
    const now = Date.now();
    const { token } = await socketToken(event);
    expect(verifySocketToken(token, 'test-api-secret')).toMatchObject({ gamerTag: user.gamerTag, discordId: user.discordId, admin: false });
    expect(verifySocketToken(token, 'test-api-secret', now + 60_001)).toBeNull();
  });
  it('管理者でも不正な設定は保存せず 400、有効なら保存する', async () => {
    getSession.mockResolvedValue({ user: { ...user, discordAuth: true } });
    readBody.mockResolvedValue({});
    await expect(setSetting(event)).rejects.toMatchObject({ statusCode: 400 });
    expect(fs.writeFileSync).not.toHaveBeenCalled();
    readBody.mockResolvedValue(defaults);
    await setSetting(event);
    expect(fs.writeFileSync).toHaveBeenCalledWith('unused-setting.json', JSON.stringify(defaults));
  });
  it('管理者でも不正な解除 ID は 400', async () => {
    getSession.mockResolvedValue({ user: { ...user, discordAuth: true } });
    readBody.mockResolvedValue({ id: 'invalid' });
    await expect(unlockJoin(event)).rejects.toMatchObject({ statusCode: 400 });
    expect(fetchBackend).not.toHaveBeenCalled();
  });
});

describe('SkyWay トークンの権限', () => {
  it('秘密キーを含めず、ルーム名と本人のメンバー名に限定する', () => {
    const result = issueSkywayToken('app-id', 'secret-key', 'dev-room', 'Alice Bob');
    expect(Object.keys(result).sort()).toEqual(['memberName', 'roomName', 'token']);
    expect(result.memberName).toBe('Alice_000020Bob');
    const payload = JSON.parse(Buffer.from(result.token.split('.')[1]!, 'base64url').toString());
    expect(payload.exp - payload.iat).toBe(24 * 60 * 60);
    expect(payload.scope.app.channels).toEqual([expect.objectContaining({ name: 'dev-room', members: [expect.objectContaining({ name: 'Alice_000020Bob' })] })]);
    expect(payload.scope.app.channels[0].id).toBeUndefined();
    expect(payload.scope.app.channels[0].members[0].id).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('secret-key');
  });
});
