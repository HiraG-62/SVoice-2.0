import { describe, expect, it, vi } from 'vitest';
import { loadConfig, parseConfig } from '../src/config';

const secrets = { JOIN_PASSWORD: 'password', API_SECRET: 'secret' };

describe('config', () => {
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
