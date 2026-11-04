import { defineStore } from 'pinia';

export const NOTIFICATION_TIMEOUT_MS = 3_000;

export const useNotificationStore = defineStore('notification', {
  state: () => ({ open: false, message: '', color: 'success' as 'success' | 'error', timeout: NOTIFICATION_TIMEOUT_MS, sequence: 0 }),
  actions: {
    show(message: string, color: 'success' | 'error') {
      this.sequence++;
      this.message = message;
      this.color = color;
      this.open = true;
    },
  },
});
