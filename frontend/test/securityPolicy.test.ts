import { describe, expect, it, vi } from 'vitest';
import { createAdminChecker } from '../server/utils/adminPolicy';
import { parseSettings } from '../server/utils/settingsValidation';
import { joinAuthMessage, loginErrorMessage } from '../utils/authMessages';
import defaults from '../settings/default.json';

describe('管理者判定', () => {
  it('Discord ID ごとに 30 秒間保持し、期限後に権限を確認し直す', async () => {
    let now = 0;
    const fetchAdmin = vi.fn().mockResolvedValue(true);
    const check = createAdminChecker(() => now);
    const user = { discordId: '1', discordAuth: true };
    expect(await check(user, fetchAdmin)).toBe(true);
    now = 29_999;
    fetchAdmin.mockResolvedValue(false);
    expect(await check(user, fetchAdmin)).toBe(true);
    expect(await check({ ...user, discordId: '2' }, fetchAdmin)).toBe(false);
    now = 30_000;
    expect(await check(user, fetchAdmin)).toBe(false);
    expect(fetchAdmin).toHaveBeenCalledTimes(3);
  });
  it('開発セッションだけ discordAuth を使う', async () => {
    const fetchAdmin = vi.fn().mockResolvedValue(false);
    const check = createAdminChecker();
    expect(await check({ discordId: '1', discordAuth: true, devLogin: true }, fetchAdmin)).toBe(true);
    expect(await check({ discordId: '1', discordAuth: false, devLogin: true }, fetchAdmin)).toBe(false);
    expect(fetchAdmin).not.toHaveBeenCalled();
    expect(await check({ discordId: '1', discordAuth: true }, fetchAdmin)).toBe(false);
  });
  it('確認失敗をキャッシュしない', async () => {
    const check = createAdminChecker();
    const fetchAdmin = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(false);
    const user = { discordId: '1', discordAuth: true };
    await expect(check(user, fetchAdmin)).rejects.toThrow('offline');
    expect(await check(user, fetchAdmin)).toBe(false);
  });
});

describe('距離設定の検証', () => {
  it('有効な設定を受け付ける', () => { expect(parseSettings(defaults)).toEqual(defaults); });
  it.each(['above', 'below', 'type', 'missing', 'bounds'])('%s を拒否する', (kind) => {
    const settings = structuredClone(defaults);
    const field = settings.general.value.minVolume;
    if (kind === 'above') field.value = field.max + 1;
    if (kind === 'below') field.value = field.min - 1;
    if (kind === 'bounds') field.min = field.max + 1;
    const input = kind === 'missing' ? {} : kind === 'type' ? { ...settings, general: 'invalid' } : settings;
    expect(parseSettings(input)).toBeNull();
  });
});

describe('認証メッセージ', () => {
  it('参加認証の結果を区別する', () => {
    expect(joinAuthMessage({ ok: true, locked: false, remaining: 5 })).toBe('');
    expect(joinAuthMessage({ ok: false, locked: false, remaining: 4 })).toBe('パスワードが違います（残り 4 回）');
    expect(joinAuthMessage({ ok: false, locked: true, remaining: 0 })).toBe('ロック中。運営に連絡');
  });
  it('OAuth の失敗理由を区別する', () => {
    expect(loginErrorMessage('nickname_missing')).toContain('ニックネーム');
    expect(loginErrorMessage('member_not_found')).toBe('Discordサーバーに参加していません。');
    expect(loginErrorMessage('internal_error')).toContain('時間を空けて');
    expect(loginErrorMessage(undefined)).toBe('');
  });
});
