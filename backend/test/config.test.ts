import { describe, expect, it, vi } from 'vitest';
import { loadConfig, loadEnvironment, logConfigPaths, parseConfig } from '../src/config';
import path from 'node:path';
import dotenv from 'dotenv';
import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const secrets = { JOIN_PASSWORD: 'password', API_SECRET: 'secret' };

describe('config', () => {
  it('ENV_FILE で指定したファイルだけを読み、既存の環境変数を優先する', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'svoice-config-'));
    const envFile = path.join(directory, 'dummy.env');
    writeFileSync(envFile, 'JOIN_PASSWORD=file-password\nAPI_SECRET=dummy\nSOCKET_PORT=3101\n');
    const env: NodeJS.ProcessEnv = { ENV_FILE: envFile, JOIN_PASSWORD: 'existing-password' };
    try {
      loadEnvironment(env);
      expect(env).toMatchObject({ JOIN_PASSWORD: 'existing-password', API_SECRET: 'dummy', SOCKET_PORT: '3101' });
    } finally {
      unlinkSync(envFile);
      rmdirSync(directory);
    }
  });

  it('既定の .env と相対 ENV_FILE は backend を基準に読み込む', () => {
    const read = vi.spyOn(dotenv, 'config').mockReturnValue({ parsed: {} });
    try {
      for (const ENV_FILE of [undefined, 'config/dev.env']) {
        const env = { ENV_FILE };
        loadEnvironment(env);
        expect(read).toHaveBeenLastCalledWith({ path: path.resolve(__dirname, '..', ENV_FILE ?? '.env'), processEnv: env, quiet: true });
      }
    } finally { read.mockRestore(); }
  });

  it('解決した主要パスを各 1 回ログに出す', () => {
    const config = parseConfig(secrets);
    const log = vi.fn();
    logConfigPaths(config, { log });
    expect(log).toHaveBeenCalledTimes(4);
    for (const key of ['DATA_DIR', 'TLS_KEY_PATH', 'TLS_CERT_PATH', 'DISCORD_TOKENS_PATH'] as const) {
      expect(log).toHaveBeenCalledWith(`${key}: ${config[key]}`);
    }
  });

  it('本番の既定ポート・機能・パスを保つ', () => {
    const config = parseConfig(secrets);
    const root = path.resolve(__dirname, '..');
    expect(config).toMatchObject({
      GAME_RECEIVER_PORT: 30000, SOCKET_PORT: 3001, DISCORD_HTTP_PORT: 5000, DISCORD_TLS_PORT: 1234,
      DISCORD_ENABLED: true, DISCORD_MEMBER_COUNT_ENABLED: true,
      DATA_DIR: root, TLS_KEY_PATH: path.join(root, 'key/privkey.pem'),
      TLS_CERT_PATH: path.join(root, 'key/fullchain.pem'), DISCORD_TOKENS_PATH: path.join(root, 'env/tokens.json'),
    });
  });

  it.each(['GAME_RECEIVER_PORT', 'SOCKET_PORT', 'DISCORD_HTTP_PORT', 'DISCORD_TLS_PORT'])('%s は整数のポートだけを受け付ける', (key) => {
    for (const value of ['0', '-1', '65536', '1.5', 'abc', '', ' ']) {
      expect(() => parseConfig({ ...secrets, [key]: value })).toThrow(key);
    }
    for (const value of ['1', '65535', '3101']) {
      expect(parseConfig({ ...secrets, [key]: value })).toHaveProperty(key, Number(value));
    }
  });

  it.each(['DISCORD_ENABLED', 'DISCORD_MEMBER_COUNT_ENABLED'])('%s は true / false だけを受け付ける', (key) => {
    for (const value of ['TRUE', '0', '1', '', 'yes']) {
      expect(() => parseConfig({ ...secrets, [key]: value })).toThrow(key);
    }
    expect(parseConfig({ ...secrets, [key]: 'false' })).toHaveProperty(key, false);
    expect(parseConfig({ ...secrets, [key]: 'true' })).toHaveProperty(key, true);
  });

  it('cwd によらず backend を基準にパスを解決する', () => {
    const original = process.cwd();
    const env = { ...secrets, DATA_DIR: 'data/dev', TLS_KEY_PATH: path.join(original, 'dummy.pem') };
    const first = parseConfig(env);
    try {
      process.chdir(path.parse(original).root);
      expect(parseConfig(env)).toEqual(first);
    } finally {
      process.chdir(original);
    }
    expect(first.DATA_DIR).toBe(path.resolve(__dirname, '../data/dev'));
    expect(first.TLS_KEY_PATH).toBe(env.TLS_KEY_PATH);
  });

  it.each(['development', 'production', undefined])('NODE_ENV=%s の TLS を決める', (NODE_ENV) => {
    expect(parseConfig({ ...secrets, NODE_ENV }).isDevelopment).toBe(NODE_ENV === 'development');
  });

  it('dev を受け付けない', () => {
    expect(() => parseConfig({ ...secrets, NODE_ENV: 'dev' })).toThrow();
  });

  it.each(['JOIN_PASSWORD', 'API_SECRET'] as const)('%s 未設定で従来のエラーを出して終了する', (key) => {
    const error = vi.fn();
    const exit = vi.fn((_code: number): never => { throw new Error('exit'); });
    expect(() => loadConfig({ ...secrets, [key]: '' }, { error, exit })).toThrow('exit');
    expect(error).toHaveBeenCalledWith(`❌ ${key} environment variable is not set`);
    expect(exit).toHaveBeenCalledWith(1);
  });
});
