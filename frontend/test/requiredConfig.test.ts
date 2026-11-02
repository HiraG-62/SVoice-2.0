import { describe, expect, it } from 'vitest';
import { findMissingConfig } from '../server/utils/requiredConfig';

const completeConfig = {
  NUXT_APP_SECRET: 'dummy-app-secret',
  NUXT_SKYWAY_APP_ID: 'dummy-app-id',
  NUXT_SKYWAY_SECRET_KEY: 'dummy-skyway-secret',
  NUXT_API_SECRET: 'dummy-api-secret',
  NUXT_PUBLIC_SERVER_SOCKET_URL: 'http://localhost:3001',
  NUXT_PUBLIC_SERVER_API_URL: 'http://localhost:5000',
  NUXT_OAUTH_DISCORD_CLIENT_ID: 'dummy-client-id',
  NUXT_OAUTH_DISCORD_CLIENT_SECRET: 'dummy-client-secret',
  NUXT_OAUTH_DISCORD_REDIRECT_URL: 'http://localhost:3000/auth/discord',
};

describe('findMissingConfig', () => {
  it('必須キーがそろっていれば空の一覧を返す', () => {
    expect(findMissingConfig(completeConfig)).toEqual([]);
  });

  it('不足したキー名をすべて返す', () => {
    const { NUXT_SKYWAY_APP_ID, NUXT_API_SECRET, ...config } = completeConfig;
    expect(findMissingConfig(config)).toEqual(['NUXT_SKYWAY_APP_ID', 'NUXT_API_SECRET']);
  });

  it('空文字のキーを不足として扱う', () => {
    expect(findMissingConfig({ ...completeConfig, NUXT_APP_SECRET: '' }))
      .toEqual(['NUXT_APP_SECRET']);
  });
});
