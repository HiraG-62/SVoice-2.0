import { defineEventHandler, readBody } from 'h3'
import fs from 'fs';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const user = session.user as { discordId: string; discordAuth: boolean; gamerTag: string };
  if (!user.discordAuth) {
    throw createError({ statusCode: 403, message: 'Admin permission required' });
  }

  const body: ingameSettings = await readBody(event);

  fs.writeFileSync('settings/setting.json', JSON.stringify(body));
})