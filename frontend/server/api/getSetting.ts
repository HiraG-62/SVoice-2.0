import fs from 'fs';

export default defineEventHandler(async (event) => {
  const setting: ingameSettings = await JSON.parse((fs.readFileSync('settings/setting.json')).toString());

  return setting;
})