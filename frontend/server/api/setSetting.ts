import { defineEventHandler, readBody } from 'h3'
import fs from 'fs';
import { getSettingStore } from '../utils/settingStore';
import { requireAdmin, requireUser } from '../utils/user';
import { parseSettings } from '../utils/settingsValidation';
import { logEvent } from '../utils/eventLog';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const user = await requireUser(event);
  const body = parseSettings(await readBody<unknown>(event));
  if (!body) throw createError({ statusCode: 400, message: '設定値不正' });

  const { file } = getSettingStore(useRuntimeConfig(event).dataDir);
  fs.writeFileSync(file, JSON.stringify(body));
  logEvent(`距離設定の保存: ${user.gamerTag}`);
})
