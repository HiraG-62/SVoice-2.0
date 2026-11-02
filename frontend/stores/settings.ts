import { defineStore } from 'pinia';
import type { IngameSettings } from '@svoice/shared';

const loading = new WeakMap<object, Promise<void>>();
export const useSettingsStore = defineStore('settings', {
  state: () => ({ value: null as IngameSettings | null, error: '' }),
  actions: {
    replace(value: IngameSettings | null) { this.value = value; },
    async load() {
      const pending = loading.get(this);
      if (pending) return pending;
      const request = (async () => {
        try { this.value = await $fetch('/api/getSetting'); this.error = ''; }
        catch (error) { this.error = '距離設定の読み込み失敗'; throw error; }
      })();
      loading.set(this, request);
      try { await request; } finally { loading.delete(this); }
    },
    async save() {
      await $fetch('/api/setSetting', { method: 'POST', body: this.value });
    },
    async defaults() { this.value = await $fetch('/api/getDefaultSetting'); },
  },
});
