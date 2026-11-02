import { readFileSync } from 'node:fs';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { ingameSettingsSchema, playerDataSchema, PLAYER_DATA_FIELDS, type PlayerData } from '../src/index';

describe('共有スキーマ', () => {
  it('default.json を読み込める', () => {
    const data: unknown = JSON.parse(readFileSync(new URL('../../../frontend/settings/default.json', import.meta.url), 'utf8'));
    expect(ingameSettingsSchema.safeParse(data).success).toBe(true);
  });

  it('必須フィールドと PlayerData のキーが一致する', () => {
    expectTypeOf<(typeof PLAYER_DATA_FIELDS)[number]>().toEqualTypeOf<keyof PlayerData>();
    expect([...PLAYER_DATA_FIELDS].sort()).toEqual(Object.keys(playerDataSchema.shape).sort());
  });

  it('プレイヤーの数値フィールドを検証する', () => {
    const data = Object.fromEntries(PLAYER_DATA_FIELDS.map((field) => [field, field === 'name' ? 'Player' : 0]));
    expect(playerDataSchema.safeParse(data).success).toBe(true);
    expect(playerDataSchema.safeParse({ ...data, x: '0' }).success).toBe(false);
  });
});
