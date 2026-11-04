import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { NOTIFICATION_TIMEOUT_MS, useNotificationStore } from '../stores/notification';

describe('操作の通知', () => {
  it('成功と失敗を同じ通知に表示し、表示時間を共有する', () => {
    setActivePinia(createPinia());
    const notification = useNotificationStore();
    expect(notification.open).toBe(false);
    expect(notification.timeout).toBe(NOTIFICATION_TIMEOUT_MS);
    expect(NOTIFICATION_TIMEOUT_MS).toBe(3_000);
    notification.show('設定保存完了', 'success');
    expect(notification.$state).toMatchObject({ open: true, message: '設定保存完了', color: 'success', sequence: 1 });
    notification.show('送信失敗', 'error');
    expect(notification.$state).toMatchObject({ open: true, message: '送信失敗', color: 'error', sequence: 2 });
  });
});
