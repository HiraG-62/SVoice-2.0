import fs from 'fs';
import type { IngameSettings } from '@svoice/shared';

export default defineEventHandler(async (event) => {
  const setting: IngameSettings = await JSON.parse((fs.readFileSync('settings/setting.json')).toString());

  return setting;
})
