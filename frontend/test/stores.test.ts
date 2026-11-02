import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAudioStore } from '../stores/audio';
import { useCallStore } from '../stores/call';
import { useSettingsStore } from '../stores/settings';
import defaults from '../settings/default.json';
import { useThemeColor } from '../composables/useThemeColor';

const saved = new Map<string, string>();
beforeEach(() => {
  setActivePinia(createPinia()); saved.clear();
  vi.stubGlobal('localStorage', { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) });
});
describe('表示用ストア', () => {
  it('保存した音量0を既定値で上書きしない', () => {
    saved.set('micLevel', '0'); saved.set('phoneLevel', '0');
    const audio = useAudioStore(); audio.hydrate();
    expect(audio.micLevel).toBe(0); expect(audio.phoneLevel).toBe(0);
  });
  it('同じタグの再配信で一覧と音量が重複しない', () => {
    const call = useCallStore(); call.addUser('Bob'); call.setUserGain('Bob', .5);
    call.setNearby('Bob', true, 1); call.addUser('Bob');
    expect(call.users).toEqual([{ gamerTag: 'Bob', gain: .5 }]);
    expect(call.nearby).toEqual([]);
    call.reset(); expect(call.users).toEqual([]);
  });
  it('距離設定の読み込みを共有し、失敗後に再試行する', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(defaults);
    vi.stubGlobal('$fetch', fetch);
    const settings = useSettingsStore();
    await expect(settings.load()).rejects.toThrow('offline');
    await Promise.all([settings.load(), settings.load()]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(settings.value).toEqual(defaults);
  });
  it('明暗を引数ごとに返す', () => {
    const theme = useThemeColor();
    expect(theme.themeColorLight(1)).toBe('teal-lighten-1');
    expect(theme.themeColorLight(3)).toBe('teal-lighten-3');
    expect(theme.themeColorDark(1)).toBe('teal-darken-1');
    expect(theme.themeColorDark(2)).toBe('teal-darken-2');
  });
});
