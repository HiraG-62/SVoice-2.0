import { describe, expect, it } from 'vitest';
import { shouldSubmitJoinAuth } from '../utils/joinAuthSubmit';

describe('参加認証の Enter', () => {
  it.each([
    ['Enter', false, false, false, true],
    ['Enter', true, false, false, false],
    ['Enter', false, true, false, false],
    ['Enter', false, false, true, false],
    ['Escape', false, false, false, false],
  ] as const)('%s / 変換中 %s / ロック %s / 送信中 %s', (key, isComposing, locked, pending, expected) => {
    expect(shouldSubmitJoinAuth({ key, isComposing }, locked, pending)).toBe(expected);
  });
});
