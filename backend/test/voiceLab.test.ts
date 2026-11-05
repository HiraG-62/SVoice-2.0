import { describe, expect, test } from 'vitest';
import { NUMERIC_PLAYER_FIELDS } from '../scripts/fakeGame';
import { createLabState, decisions, REASONS } from '../scripts/voiceLab/state';
import settings from '../../frontend/settings/default.json';

describe('voice-lab の状態', () => {
  test('行の追加・削除とボットの初期位置', () => {
    const state = createLabState(['Alice'], ['Bot1', 'Bot2']);
    expect(state.rows.map(row => row.player.location.coordinates.x)).toEqual([0, 5, 10]);
    expect(() => state.add('Alice', 'bot')).toThrow();
    for (const name of ['', ' '.repeat(2), 'a'.repeat(101)]) expect(() => state.add(name, 'listener')).toThrow();
    state.add('Bob', 'listener');
    state.remove('Bot1');
    expect(state.rows.map(row => row.player.name)).toEqual(['Alice', 'Bot2', 'Bob']);
    expect(() => state.remove('不在')).toThrow();
  });

  test('全項目・任意の有限数と name の固定', () => {
    const state = createLabState(['Alice'], []);
    const collectFields = (value: object, prefix = ''): string[] => Object.entries(value).flatMap(([key, child]: [string, unknown]) => {
      const field = prefix ? `${prefix}.${key}` : key;
      if (typeof child === 'number') return [field];
      return typeof child === 'object' && child !== null ? collectFields(child, field) : [];
    });
    expect(collectFields(state.rows[0].player).sort()).toEqual([...NUMERIC_PLAYER_FIELDS].sort());
    for (const field of NUMERIC_PLAYER_FIELDS) {
      state.update('Alice', field, -7.25);
      const value = field.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown>)[key], state.rows[0].player);
      expect(value).toBe(-7.25);
    }
    for (const value of [NaN, Infinity, -Infinity, '1', null]) {
      expect(() => state.update('Alice', 'music', value)).toThrow();
    }
    for (const field of ['name', '__proto__.x', 'location', 'unknown']) expect(() => state.update('Alice', field, 1)).toThrow();
    expect(state.rows[0].player.name).toBe('Alice');
  });

  test('送信対象と聞き手の選択', () => {
    const state = createLabState(['Alice', 'Bob'], ['Bot1']);
    state.include('Bot1', false);
    expect(state.players().map(player => player.name)).toEqual(['Alice', 'Bob']);
    state.sending = false;
    expect(state.players()).toEqual([]);
    state.select('Bot1');
    expect(state.listener).toBe('Bot1');
    state.remove('Bot1');
    expect(state.listener).toBe('Alice');
    expect(() => state.select('不在')).toThrow();
  });
});

describe('voice-lab の判定', () => {
  test('実際の volume モジュールによる全 reason と手順', () => {
    const state = createLabState(['Alice'], ['Bot']);
    const self = state.rows[0].player, other = state.rows[1].player;
    const current = () => decisions(state, settings)[0];
    expect(current()).toMatchObject({ distance: 5, volume: 1, subscribe: true, reason: 'distance', step: 11 });
    other.location.server = 2;
    expect(current()).toMatchObject({ volume: 0, subscribe: false, reason: 'server', step: 3 });
    other.location.server = 1;
    self.music = 2; other.music = 1;
    expect(current().step).toBe(4);
    self.music = 0; self.telephone = other.telephone = 1;
    expect(current().step).toBe(5);
    self.telephone = other.telephone = 0;
    self.transceiver.number = other.transceiver.number = 1; other.transceiver.type = 1;
    expect(current().step).toBe(8);
    other.transceiver.type = 2; self.radio = { type: 0, number: 3 }; other.radio = { type: 1, number: 3 };
    expect(current().step).toBe(9);
    other.radio.type = 2; other.location.dimension = -1;
    expect(current().step).toBe(10);
    other.location.dimension = 0;
    expect(decisions(state, null)[0]).toMatchObject({ reason: 'settingsMissing', step: null });
    state.include('Alice', false);
    expect(current()).toMatchObject({ reason: 'offGame', step: 2, subscribe: false });
    state.rows[1].bot = { status: 'joined', speaker: true, message: '' };
    expect(current()).toMatchObject({ reason: 'admin', step: 1, subscribe: true, volume: 1 });
    state.sending = false;
    expect(current().step).toBe(1);
    expect(Object.keys(REASONS)).toHaveLength(10);
  });
});
