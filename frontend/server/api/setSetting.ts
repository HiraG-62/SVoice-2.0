import { defineEventHandler, readBody } from 'h3'
import fs from 'fs';
import type { IngameSettings } from '@svoice/shared';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const user = session.user;
  if (!user.discordAuth) {
    throw createError({ statusCode: 403, message: 'Admin permission required' });
  }

  const body: IngameSettings = await readBody(event);

  fs.writeFileSync('settings/setting.json', JSON.stringify(body));
})
