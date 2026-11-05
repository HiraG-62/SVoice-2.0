import { expect, test, type Page } from '@playwright/test';

async function openReadyPage(page: Page) {
  const initialized = page.waitForResponse(response => response.url().endsWith('/api/getSetting') && response.ok());
  await page.goto('/');
  await initialized;
}

const notification = (page: Page) => page.locator('.v-snackbar').getByRole('status');

test('参加パスワードの Enter と変換中の送信抑止', async ({ page }) => {
  await page.request.post('/auth/dev', { data: { gamerTag: `UX-Auth-${Date.now()}`, admin: false } });
  await page.route('**/api/getJoinRole', route => route.fulfill({ json: false }));
  let requests = 0;
  let finish!: () => Promise<void>;
  await page.route('**/api/joinAuth', async route => {
    requests++;
    await new Promise<void>(resolve => {
      finish = async () => { await route.fulfill({ json: { ok: false, locked: true, remaining: 0 } }); resolve(); };
    });
  });
  await openReadyPage(page);
  const password = page.getByRole('textbox', { name: 'パスワード' });
  await expect(password).toHaveAttribute('type', 'text');
  await password.fill('test');
  await password.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
  expect(requests).toBe(0);
  await password.press('Enter');
  await expect.poll(() => requests).toBe(1);
  await expect(password).toBeDisabled();
  await password.dispatchEvent('keydown', { key: 'Enter', isComposing: false });
  expect(requests).toBe(1);
  await finish();
  await expect(page.getByRole('button', { name: '送信', exact: true })).toBeDisabled();
  await password.dispatchEvent('keydown', { key: 'Enter', isComposing: false });
  expect(requests).toBe(1);
});

test('設定の失敗通知と保存・ロック解除の完了通知', async ({ page }) => {
  await page.request.post('/auth/dev', { data: { gamerTag: `UX-Admin-${Date.now()}`, admin: true } });
  await openReadyPage(page);
  await page.locator('.mdi-cog').click();
  await page.getByRole('tab', { name: '一般', exact: true }).click();
  await page.getByRole('button', { name: '送信', exact: true }).click();
  await expect(notification(page)).toHaveText('送信失敗');

  await page.route('**/api/setSetting', route => route.fulfill({ status: 500, json: {} }));
  await page.getByRole('tab', { name: 'インゲーム', exact: true }).click();
  await page.getByRole('button', { name: '変更確定', exact: true }).click();
  await expect(notification(page)).toHaveText('設定保存失敗');
  await page.route('**/api/setSetting', route => route.fulfill({ json: { success: true } }));
  await page.getByRole('button', { name: '変更確定', exact: true }).click();
  await expect(notification(page)).toHaveText('設定保存完了');

  const lock = { id: '123456789012345678', gamerTag: 'UX-Locked', lockedAt: new Date().toISOString() };
  await page.route('**/api/admin/joinLocks', route => route.fulfill({ json: [lock] }));
  await page.route('**/api/admin/unlockJoin', route => route.fulfill({ status: 500, json: {} }));
  await page.getByRole('tab', { name: '参加ロック', exact: true }).click();
  await page.getByRole('button', { name: '解除', exact: true }).click();
  await expect(notification(page)).toHaveText('ロック解除失敗');
  await expect(page.getByRole('alert')).toHaveText('ロック解除失敗');
  await page.route('**/api/admin/unlockJoin', route => route.fulfill({ json: { success: true } }));
  await page.getByRole('button', { name: '解除', exact: true }).click();
  await expect(notification(page)).toHaveText('ロック解除完了');
});

for (const [width, device] of [[1280, 'desktop'], [390, 'mobile']] as const) {
  test(`サウンド設定の表示とマイクテストの終了: ${device}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.request.post('/auth/dev', { data: { gamerTag: `UX-${device}-${Date.now()}`, admin: false } });
    await openReadyPage(page);
    await page.locator('.mdi-cog').click();
    await page.getByRole('tab', { name: 'サウンド', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('※OS の既定の出力を使用', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'マイク音量の上限を上げます。声が小さすぎるとき用', exact: true }).click();
    await expect(page.getByRole('tooltip').filter({ hasText: '声が小さすぎるとき用' })).toBeVisible();
    const bounds = await dialog.locator('.v-overlay__content').boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.height).toBeLessThanOrEqual(900);
    if (device === 'desktop') expect(bounds!.width).toBe(800);
    else expect(bounds!.width).toBe(width);
    await page.screenshot({ path: `C:/Users/Horry/.clodex/artifacts/E--dev-SyakasabaVC-29b73fa9/ux-settings-${device}.png`, fullPage: true });
    await dialog.getByRole('button', { name: 'テスト', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'テスト中', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await page.locator('.mdi-cog').click();
    await expect(dialog.getByRole('button', { name: 'テスト', exact: true })).toBeVisible();
    if (device === 'desktop') {
      await dialog.getByRole('button', { name: 'テスト', exact: true }).click();
      await page.locator('.v-overlay__scrim').click({ position: { x: 5, y: 5 } });
      await expect(dialog).toBeHidden();
      await page.locator('.mdi-cog').click();
      await expect(dialog.getByRole('button', { name: 'テスト', exact: true })).toBeVisible();
    }
  });
}
