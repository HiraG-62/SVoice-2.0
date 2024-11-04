import { defineEventHandler, readBody } from 'h3'
import fs from 'fs';

export default defineEventHandler(async (event) => {
  const body: ingameSettings = await readBody(event);

  fs.writeFileSync('settings/setting.json', JSON.stringify(body));
})