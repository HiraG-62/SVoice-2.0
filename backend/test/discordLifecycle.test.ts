import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDiscordService, startDiscordServer } from '../src/discordBot';
import { config } from './fixtures';

const mocks = vi.hoisted(() => ({ login: vi.fn(), ready: vi.fn(), joinVoiceChannel: vi.fn(), fetchGuild: vi.fn() }));
vi.mock('@discordjs/voice', () => ({ joinVoiceChannel: mocks.joinVoiceChannel }));
vi.mock('discord.js', async () => {
  const { EventEmitter } = await import('node:events');
  return {
  GatewayIntentBits: {},
  Client: class extends EventEmitter {
    readyState = false;
    login(token: string) { return mocks.login(this, token); }
    isReady() { return this.readyState; }
    markReady() { this.readyState = true; this.emit('clientReady', this); }
    destroy = vi.fn();
    user = { setPresence: vi.fn() };
    override once(event: string, listener: (...args: unknown[]) => void) {
      mocks.ready(event);
      return super.once(event, listener);
    }
    guilds = { fetch: vi.fn(async () => {
      mocks.fetchGuild();
      return {
      id: 'guild', channels: { cache: new Map([['room', { id: 'room' }]]) }, voiceAdapterCreator: {},
      members: { fetch: async () => ({ nickname: '[Player]', roles: { cache: new Set(['join']) } }) },
    }; }) };
  },
  };
});

afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); vi.useRealTimers(); });

describe('Discord 起動', () => {
  it('ログイン中も内部 API が listen し、停止では Bot を破棄して両ポートを解放する', async () => {
    const tokensPath = path.resolve('dummy-tokens.json');
    const originalRead = fs.readFileSync;
    vi.spyOn(fs, 'readFileSync').mockImplementation((file, options) => file === tokensPath ? '{"tokens":["dummy"]}' : originalRead(file, options));
    const destroy = vi.fn(async () => {});
    mocks.login.mockImplementation((bot: { destroy: typeof destroy }) => {
      bot.destroy = destroy;
      return new Promise(() => {});
    });
    const onServer = vi.fn();
    const service = createDiscordService({ ...config, DISCORD_TOKENS_PATH: tokensPath,
      DISCORD_HTTP_PORT: 0, DISCORD_TLS_PORT: 0 }, () => [], { onServer });
    const servers = await service.ready;
    const ports = Object.values(servers).map(server => (server.address() as AddressInfo).port);
    try {
      expect(Object.values(servers).every(server => server.listening)).toBe(true);
      expect(onServer).toHaveBeenCalledTimes(2);
      for (const endpoint of ['getUserName', 'getJoinRole', 'checkAdminRole', 'setPhoneRole', 'removePhoneRole']) {
        await request(servers.httpServer).get(`/${endpoint}?id=123456789012345678`).set('x-api-secret', config.API_SECRET)
          .expect(503, { error: 'discord_starting' });
      }
      expect(mocks.fetchGuild).not.toHaveBeenCalled();
      expect(mocks.joinVoiceChannel).not.toHaveBeenCalled();
    } finally { await service.close(); }
    expect(destroy).toHaveBeenCalled();
    expect(Object.values(servers).every(server => !server.listening)).toBe(true);
    await Promise.all(Object.values(servers).map((server, index) => new Promise<void>(resolve => {
      server.listen(ports[index], () => { server.close(() => resolve()); });
    })));
  });

  it('Bot 読み込み完了後は同じ内部 API で Discord を使う', async () => {
    const tokensPath = path.resolve('dummy-tokens.json');
    const originalRead = fs.readFileSync;
    vi.spyOn(fs, 'readFileSync').mockImplementation((file, options) => file === tokensPath ? '{"tokens":["dummy"]}' : originalRead(file, options));
    let markReady: () => void = () => {};
    mocks.login.mockImplementation(async (bot: { markReady: () => void }) => { markReady = () => bot.markReady(); });
    const service = createDiscordService({ ...config, DISCORD_TOKENS_PATH: tokensPath,
      DISCORD_HTTP_PORT: 0, DISCORD_TLS_PORT: 0 }, () => []);
    try {
      const servers = await service.ready;
      expect(mocks.fetchGuild).not.toHaveBeenCalled();
      markReady();
      await service.botsReady;
      await request(servers.httpServer).get('/getJoinRole?id=123456789012345678').set('x-api-secret', config.API_SECRET).expect(200, 'true');
      expect(mocks.fetchGuild).toHaveBeenCalledOnce();
    } finally { await service.close(); }
  });

  it('終了時は Bot の切断完了を待ち、人数表示を停止する', async () => {
    const tokensPath = path.resolve('dummy-tokens.json');
    const originalRead = fs.readFileSync;
    vi.spyOn(fs, 'readFileSync').mockImplementation((file, options) => file === tokensPath ? '{"tokens":["dummy"]}' : originalRead(file, options));
    let finish: () => void = () => {};
    const destroy = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    mocks.login.mockImplementation(async (bot: { markReady: () => void; destroy: typeof destroy }) => {
      bot.destroy = destroy;
      bot.markReady();
    });
    const service = createDiscordService({ ...config, DISCORD_TOKENS_PATH: tokensPath, DISCORD_HTTP_PORT: 0, DISCORD_TLS_PORT: 0 }, () => []);
    const servers = await service.ready;
    await service.botsReady;
    expect(servers).toBeDefined();
    await Promise.all(Object.values(servers!).map(server => server.listening ? undefined : once(server, 'listening')));
    let closed = false;
    const closing = service.close().then(() => { closed = true; });
    await Promise.resolve();
    expect(closed).toBe(false);
    finish();
    await closing;
    expect(destroy).toHaveBeenCalledOnce();
    expect(Object.values(servers!).every(server => !server.listening)).toBe(true);
  });

  it.each([false, true])('人数表示 enabled=%s でも Bot はログインする', async (enabled) => {
    const tokensPath = path.resolve('dummy-tokens.json');
    const originalRead = fs.readFileSync;
    vi.spyOn(fs, 'readFileSync').mockImplementation((file, options) => {
      if (file === tokensPath) return '{"tokens":["dummy"]}';
      return originalRead(file, options);
    });
    mocks.login.mockImplementation(async (bot: { markReady: () => void }) => {
      expect(mocks.ready).toHaveBeenCalledWith('clientReady');
      bot.markReady();
      return 'dummy';
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const servers = await startDiscordServer({ ...config, DISCORD_TOKENS_PATH: tokensPath,
      DISCORD_HTTP_PORT: 0, DISCORD_TLS_PORT: 0, DISCORD_MEMBER_COUNT_ENABLED: enabled }, () => []);
    try {
      expect(mocks.login).toHaveBeenCalledOnce();
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

  it.each(['missing', 'invalid', 'empty'])('トークンファイル %s でも内部 API を起動する', async (mode) => {
    const tokensPath = path.resolve('dummy-tokens.json');
    const originalRead = fs.readFileSync;
    vi.spyOn(fs, 'readFileSync').mockImplementation((file, options) => {
      if (file !== tokensPath) return originalRead(file, options);
      if (mode === 'missing') throw new Error('missing');
      return mode === 'invalid' ? 'invalid' : '{"tokens":[]}';
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const servers = await startDiscordServer({ ...config, DISCORD_TOKENS_PATH: tokensPath, DISCORD_HTTP_PORT: 0, DISCORD_TLS_PORT: 0 }, () => []);
    try {
      expect(mocks.login).not.toHaveBeenCalled();
      expect(mocks.joinVoiceChannel).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith('Discord 利用不可: Bot なし');
      for (const server of Object.values(servers)) {
        await request(server).get('/getUserName?id=123456789012345678').set('x-api-secret', config.API_SECRET).expect(503, { error: 'discord_unavailable' });
        await request(server).get('/getJoinRole?id=123456789012345678').set('x-api-secret', config.API_SECRET).expect(200, 'true');
      }
    } finally {
      await Promise.all(Object.values(servers).map(async (server) => {
        if (!server.listening) await once(server, 'listening');
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }));
    }
  });

  it('login が先に完了しても ready まで Bot を使わない', async () => {
    const tokensPath = path.resolve('dummy-tokens.json');
    const originalRead = fs.readFileSync;
    vi.spyOn(fs, 'readFileSync').mockImplementation((file, options) => file === tokensPath ? '{"tokens":["dummy"]}' : originalRead(file, options));
    let markReady: (() => void) | undefined;
    mocks.login.mockImplementation(async (bot: { markReady: () => void }) => { markReady = () => bot.markReady(); return 'dummy'; });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const started = startDiscordServer({ ...config, DISCORD_TOKENS_PATH: tokensPath, DISCORD_HTTP_PORT: 0, DISCORD_TLS_PORT: 0 }, () => []);
    await vi.advanceTimersByTimeAsync(10);
    expect(mocks.joinVoiceChannel).not.toHaveBeenCalled();
    expect(markReady).toBeDefined();
    markReady!();
    const servers = await started;
    try {
      await vi.advanceTimersByTimeAsync(3000);
      expect(mocks.joinVoiceChannel).toHaveBeenCalledOnce();
    } finally {
      await Promise.all(Object.values(servers).map(async (server) => {
        if (!server.listening) await once(server, 'listening');
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }));
      expect(vi.getTimerCount()).toBe(0);
    }
  });

  it('全 Bot のログインが失敗しても内部 API を起動する', async () => {
    const tokensPath = path.resolve('dummy-tokens.json');
    const originalRead = fs.readFileSync;
    vi.spyOn(fs, 'readFileSync').mockImplementation((file, options) => file === tokensPath ? '{"tokens":["dummy"]}' : originalRead(file, options));
    mocks.login.mockRejectedValue(new Error('login failed'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const started = startDiscordServer({ ...config, DISCORD_TOKENS_PATH: tokensPath, DISCORD_HTTP_PORT: 0, DISCORD_TLS_PORT: 0 }, () => []);
    await vi.advanceTimersByTimeAsync(300_000);
    const servers = await started;
    try {
      expect(mocks.login).toHaveBeenCalledTimes(5);
      expect(mocks.joinVoiceChannel).not.toHaveBeenCalled();
      await request(servers.httpServer).get('/checkAdminRole?id=123456789012345678').set('x-api-secret', config.API_SECRET).expect(200, 'false');
    } finally {
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
      await request(servers.httpServer).get('/getJoinRole?id=123456789012345678').set('x-api-secret', config.API_SECRET).expect(200, 'true');
    } finally {
      await Promise.all(Object.values(servers).map(async (server) => {
        if (!server.listening) await once(server, 'listening');
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }));
    }
  });
});
