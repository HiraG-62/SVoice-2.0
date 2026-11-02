import { defineEventHandler, readBody } from 'h3'
import fs from 'fs';
import { getSettingStore } from '../utils/settingStore';
import { requireAdmin } from '../utils/user';
import { parseSettings } from '../utils/settingsValidation';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const body = parseSettings(await readBody<unknown>(event));
  if (!body) throw createError({ statusCode: 400, message: '設定値不正' });

  const { file } = getSettingStore(useRuntimeConfig(event).dataDir);
  fs.writeFileSync(file, JSON.stringify(body));
})
