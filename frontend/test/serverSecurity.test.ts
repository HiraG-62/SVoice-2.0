import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { H3Event } from 'h3';
import { verifySocketToken } from '@svoice/shared/socket-token';
import { issueSkywayToken } from '../server/utils/skywayToken';
import defaults from '../settings/default.json';

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  readBody: (event: unknown) => readBody(event),
  setResponseStatus: (event: unknown, status: number) => setResponseStatus(event, status),
}));
vi.mock('node:fs', () => ({ default: { writeFileSync: vi.fn() } }));
vi.mock('../server/utils/settingStore', () => ({ getSettingStore: () => ({ file: 'unused-setting.json' }) }));

const user = { discordId: '123456789012345678', gamerTag: 'Alice Bob', discordAuth: false, devLogin: true };
const discordUser = { discordId: '234567890123456789', gamerTag: 'Carol', discordAuth: false };
const fetchBackend = vi.fn();
const getSession = vi.fn();
const readBody = vi.fn();
const setResponseStatus = vi.fn();
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
afterEach(() => { vi.restoreAllMocks(); });

describe('セッションに基づく API', () => {
  it('距離設定は保存成功時だけ管理者のタグを記録する', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    getSession.mockResolvedValue({ user: { ...user, discordAuth: true } });
    readBody.mockResolvedValue({});
    await expect(setSetting(event)).rejects.toMatchObject({ statusCode: 400 });
    expect(log).not.toHaveBeenCalled();
    readBody.mockResolvedValue(defaults);
    vi.mocked(fs.writeFileSync).mockImplementationOnce(() => { throw new Error('保存不可'); });
    await expect(setSetting(event)).rejects.toThrow('保存不可');
    expect(log).not.toHaveBeenCalled();
    await setSetting(event);
    expect(log.mock.calls).toEqual([['距離設定の保存: Alice Bob']]);
  });

  it('ロック解除は backend 成功時だけ ID の末尾 4 桁を記録する', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    getSession.mockResolvedValue({ user: { ...user, discordAuth: true } });
    const id = '987654321012345678';
    readBody.mockResolvedValue({ id });
    fetchBackend.mockRejectedValueOnce(new Error('解除不可'));
    await expect(unlockJoin(event)).rejects.toThrow('解除不可');
    expect(log).not.toHaveBeenCalled();
    fetchBackend.mockResolvedValueOnce({ success: false });
    expect(await unlockJoin(event)).toEqual({ success: false });
    expect(log).not.toHaveBeenCalled();
    fetchBackend.mockResolvedValueOnce({ success: true });
    expect(await unlockJoin(event)).toEqual({ success: true });
    expect(log.mock.calls).toEqual([['参加ロック解除: Alice Bob → ...5678']]);
    expect(JSON.stringify(log.mock.calls)).not.toContain(id);
    expect(JSON.stringify(log.mock.calls)).not.toContain(user.discordId);
  });

  it('ログの制御文字を空白にし、出力失敗でも保存と解除は成功する', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    getSession.mockResolvedValue({ user: { ...user, gamerTag: 'Alice\nBob', discordAuth: true } });
    readBody.mockResolvedValue(defaults);
    await setSetting(event);
    expect(log).toHaveBeenCalledWith('距離設定の保存: Alice Bob');
    log.mockImplementation(() => { throw new Error('出力不可'); });
    await expect(setSetting(event)).resolves.toBeUndefined();
    readBody.mockResolvedValue({ id: user.discordId });
    fetchBackend.mockResolvedValueOnce({ success: true });
    await expect(unlockJoin(event)).resolves.toEqual({ success: true });
  });

  it.each([getJoinRole, setPhoneRole, removePhoneRole])('ロール操作はセッションの ID を使う', async handler => {
    getSession.mockResolvedValue({ user: discordUser });
    await handler(event);
    expect(fetchBackend).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ query: { id: discordUser.discordId } }));
  });
  it('Bot のログイン中は 503 とエラーを中継する', async () => {
    getSession.mockResolvedValue({ user: discordUser });
    fetchBackend.mockRejectedValueOnce({ statusCode: 503, data: { error: 'discord_starting' } });
    expect(await getJoinRole(event)).toEqual({ error: 'discord_starting' });
    expect(setResponseStatus).toHaveBeenCalledWith(event, 503);
  });
  it('起動待ち以外の失敗は従来どおり例外にする', async () => {
    getSession.mockResolvedValue({ user: discordUser });
    const error = { statusCode: 500, data: { error: 'internal_error' } };
    fetchBackend.mockRejectedValueOnce(error);
    await expect(getJoinRole(event)).rejects.toBe(error);
    expect(setResponseStatus).not.toHaveBeenCalled();
  });
  it.each([
    [getJoinRole, true],
    [setPhoneRole, { success: true }],
    [removePhoneRole, { success: true }],
  ])('開発用ログインのロール操作は Discord に問い合わせない', async (handler, result) => {
    expect(await handler(event)).toEqual(result);
    expect(fetchBackend).not.toHaveBeenCalled();
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
    expect(fetchBackend).toHaveBeenCalledWith('http://backend/joinAuth', expect.objectContaining({ body: { pass: 'wrong', id: user.discordId, gamerTag: user.gamerTag, skipRole: true } }));
  });
  it('通常ログインでは入力の skipRole を中継しない', async () => {
    getSession.mockResolvedValue({ user: discordUser });
    readBody.mockResolvedValue({ pass: 'password', skipRole: true });
    await joinAuth(event);
    expect(fetchBackend).toHaveBeenCalledWith('http://backend/joinAuth', expect.objectContaining({ body: { pass: 'password', id: discordUser.discordId, gamerTag: discordUser.gamerTag } }));
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
