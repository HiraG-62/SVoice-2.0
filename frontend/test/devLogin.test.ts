import { describe, expect, it } from 'vitest';
import { createDevDiscordId, isDevLoginEnabled, parseDevLogin } from '../server/utils/devLogin';

describe('開発用ログイン', () => {
  it.each([
    [true, 'true', true],
    [true, 'false', false],
    [false, 'true', false],
    [false, 'false', false],
    [true, undefined, false],
    [true, true, true],
    [false, true, false],
  ])('dev=%s、設定=%s の可否', (dev, enabled, expected) => {
    expect(isDevLoginEnabled(dev, enabled)).toBe(expected);
  });

  it('偽 ID はタグごとに決まる 18 桁の数字', () => {
    for (const tag of ['Alice', 'Bob', '日本語 タグ']) {
      const id = createDevDiscordId(tag);
      expect(id).toBe(createDevDiscordId(tag));
      expect(id).toMatch(/^[1-9]\d{17}$/);
      expect(id).toMatch(/^\d{17,20}$/);
    }
    expect(createDevDiscordId('Alice')).not.toBe(createDevDiscordId('Bob'));
  });

  it.each(['Alice', '日本語 タグ', 'a'.repeat(100)])('有効なタグ %s', (gamerTag) => {
    expect(parseDevLogin({ gamerTag, admin: true })).toEqual({ gamerTag, admin: true });
  });

  it.each([null, {}, { gamerTag: '', admin: false }, { gamerTag: 'a'.repeat(101), admin: false },
    { gamerTag: 1, admin: false }, { gamerTag: 'Alice' }, { gamerTag: 'Alice', admin: 'true' }])(
    '不正な本文を拒否する: %j', (body) => {
      expect(parseDevLogin(body)).toBeNull();
    });
});
