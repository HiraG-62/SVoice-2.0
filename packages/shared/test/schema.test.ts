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

  const data = {
    name: 'Player', location: { server: 1, dimension: 0, coordinates: { x: 0, y: 64, z: 0 } },
    telephone: 0, hasTelephone: 0, useMegaphone: 0, useMicrophone: 0, music: 0, mute: 0,
    transceiver: { type: 2, number: 0 }, radio: { type: 2, number: 0 },
    voiceOptions: { rangeOutput: 100, volumeOutput: 100, rangeInput: 100, volumeInput: 100 },
  };
  it('新しいプレイヤー形式を受け付ける', () => {
    expect(playerDataSchema.safeParse(data).success).toBe(true);
  });
  it.each(['0', true, null, NaN, Infinity, -Infinity])('数値の変換や非有限数を受け付けない: %s', value => {
    expect(playerDataSchema.safeParse({ ...data, music: value }).success).toBe(false);
    expect(playerDataSchema.safeParse({ ...data, location: { ...data.location, coordinates: { x: value, y: 0, z: 0 } } }).success).toBe(false);
    expect(playerDataSchema.safeParse({ ...data, radio: { type: value, number: 0 } }).success).toBe(false);
    expect(playerDataSchema.safeParse({ ...data, voiceOptions: { ...data.voiceOptions, rangeOutput: value } }).success).toBe(false);
  });
  it('旧形式と空の名前を受け付けない', () => {
    const { location, ...rest } = data;
    expect(playerDataSchema.safeParse({ ...rest, dimension: 0, x: 0, y: 64, z: 0 }).success).toBe(false);
    expect(playerDataSchema.safeParse({ ...data, name: '' }).success).toBe(false);
  });
});
