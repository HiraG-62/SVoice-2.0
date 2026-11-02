import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startDiscordServer } from '../src/discordBot';
import { config } from './fixtures';

const mocks = vi.hoisted(() => ({ login: vi.fn(), ready: vi.fn(), joinVoiceChannel: vi.fn() }));
vi.mock('@discordjs/voice', () => ({ joinVoiceChannel: mocks.joinVoiceChannel }));
vi.mock('discord.js', () => ({
  GatewayIntentBits: {},
  Client: class {
    login = mocks.login;
    user = { setPresence: vi.fn() };
    once = mocks.ready;
    guilds = { fetch: vi.fn(async () => ({
      id: 'guild', channels: { cache: new Map([['room', { id: 'room' }]]) }, voiceAdapterCreator: {},
    })) };
  },
}));

afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); vi.useRealTimers(); });

describe('Discord 起動', () => {
  it.each([false, true])('人数表示 enabled=%s でも Bot はログインする', async (enabled) => {
    const tokensPath = path.resolve('dummy-tokens.json');
    const originalRead = fs.readFileSync;
    vi.spyOn(fs, 'readFileSync').mockImplementation((file, options) => {
      if (file === tokensPath) return '{"tokens":["dummy"]}';
      return originalRead(file, options);
    });
    mocks.login.mockResolvedValue('dummy');
    const servers = await startDiscordServer({ ...config, DISCORD_TOKENS_PATH: tokensPath,
      DISCORD_HTTP_PORT: 0, DISCORD_TLS_PORT: 0, DISCORD_MEMBER_COUNT_ENABLED: enabled }, () => []);
    try {
      expect(mocks.login).toHaveBeenCalledOnce();
      vi.useFakeTimers();
      for (const [, callback] of mocks.ready.mock.calls) void callback();
      await vi.advanceTimersByTimeAsync(30_000);
      expect(mocks.joinVoiceChannel).toHaveBeenCalledTimes(enabled ? 1 : 0);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
      await Promise.all(Object.values(servers).map(async (server) => {
        if (!server.listening) await once(server, 'listening');
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }));
    }
  });

  it('Discord 無効では tokens を読まず、Bot にログインしない', async () => {
    const read = vi.spyOn(fs, 'readFileSync');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const servers = await startDiscordServer({ ...config, DISCORD_ENABLED: false,
      DISCORD_TOKENS_PATH: path.resolve('missing-tokens.json'), DISCORD_HTTP_PORT: 0, DISCORD_TLS_PORT: 0 }, () => []);
    try {
      expect(read).not.toHaveBeenCalled();
      expect(mocks.login).not.toHaveBeenCalled();
      expect(mocks.joinVoiceChannel).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith('Discord 機能は無効');
    } finally {
      await Promise.all(Object.values(servers).map(async (server) => {
        if (!server.listening) await once(server, 'listening');
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }));
    }
  });
});
