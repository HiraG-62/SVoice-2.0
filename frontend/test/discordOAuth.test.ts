import { beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('Discord OAuth の起動待ち', () => {
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
