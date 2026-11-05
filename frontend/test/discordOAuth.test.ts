import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { H3Event } from 'h3';

const { sendRedirect } = vi.hoisted(() => ({ sendRedirect: vi.fn() }));
vi.mock('nuxt/server', () => ({ sendRedirect }));
const fetchBackend = vi.fn();
const setSession = vi.fn();
const defineHandler = vi.fn((handler: {
  onSuccess: (event: H3Event, identity: { user: { id: string } }) => Promise<unknown>;
}) => handler);
vi.stubGlobal('defineOAuthDiscordEventHandler', defineHandler);
vi.stubGlobal('useRuntimeConfig', () => ({ apiSecret: 'test-secret', public: { server: { api: { url: 'http://backend' } } } }));
vi.stubGlobal('$fetch', fetchBackend);
vi.stubGlobal('setUserSession', setSession);
await import('../server/routes/auth/discord.get');
const handler = defineHandler.mock.calls[0]![0];
const event = {} as H3Event;
const identity = { user: { id: '123456789012345678' } };

beforeEach(() => { vi.resetAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('Discord OAuth の起動待ち', () => {
  it.each([false, true])('ログイン成功時にゲーマータグと管理者=%s を記録する', async admin => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    fetchBackend.mockResolvedValueOnce('Player').mockResolvedValueOnce(admin);
    await handler.onSuccess(event, identity);
    expect(log.mock.calls).toEqual([[`ログイン: Player${admin ? '（管理者）' : ''}`]]);
    expect(setSession).toHaveBeenCalledWith(event, expect.objectContaining({ user: {
      discordId: identity.user.id, discordAuth: admin, gamerTag: 'Player',
    } }));
    expect(sendRedirect).toHaveBeenCalledWith(event, '/');
    expect(JSON.stringify(log.mock.calls)).not.toContain(identity.user.id);
  });

  it('セッション保存の失敗では成功ログを出さず、ログ出力失敗でもリダイレクトする', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    fetchBackend.mockResolvedValueOnce('Player').mockResolvedValueOnce(false);
    setSession.mockRejectedValueOnce(new Error('保存不可'));
    await expect(handler.onSuccess(event, identity)).rejects.toThrow('保存不可');
    expect(log).not.toHaveBeenCalled();
    fetchBackend.mockResolvedValueOnce('Player').mockResolvedValueOnce(false);
    log.mockImplementation(() => { throw new Error('出力不可'); });
    await handler.onSuccess(event, identity);
    expect(sendRedirect).toHaveBeenCalledWith(event, '/');
  });

  it.each(['getUserName', 'checkAdminRole'])('%s の起動待ちをログイン画面へ中継する', async endpoint => {
    if (endpoint === 'checkAdminRole') fetchBackend.mockResolvedValueOnce('Player');
    fetchBackend.mockRejectedValueOnce({ statusCode: 503, data: { error: 'discord_starting' } });
    await handler.onSuccess(event, identity);
    expect(sendRedirect).toHaveBeenCalledWith(event, '/?error=discord_starting');
    expect(setSession).not.toHaveBeenCalled();
  });

  it.each(['nickname_missing', 'member_not_found', 'internal_error'])('既存の失敗 %s の扱いは変えない', async reason => {
    fetchBackend.mockRejectedValueOnce({ data: { error: reason } });
    await handler.onSuccess(event, identity);
    expect(sendRedirect).toHaveBeenCalledWith(event, `/?error=${reason}`);
    expect(setSession).not.toHaveBeenCalled();
  });
});
