import fs from 'fs';
import type { IngameSettings } from '@svoice/shared';
import { getSettingStore } from '../utils/settingStore';

export default defineEventHandler(async (event) => {
  const { file } = getSettingStore(useRuntimeConfig(event).dataDir);
  const setting: IngameSettings = JSON.parse(fs.readFileSync(file, 'utf8'));

  return setting;
})
