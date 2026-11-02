import { createDevDiscordId, isDevLoginEnabled, parseDevLogin } from '../../utils/devLogin';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  if (!isDevLoginEnabled(import.meta.dev, config.devLoginEnabled)) {
    throw createError({ statusCode: 404, message: 'Not found' });
  }

  const login = parseDevLogin(await readBody<unknown>(event));
  if (!login) throw createError({ statusCode: 400, message: 'Invalid login' });

  const discordId = createDevDiscordId(login.gamerTag);
  await setUserSession(event, {
    user: { discordId, discordAuth: login.admin, gamerTag: login.gamerTag },
    loggedInAt: new Date(),
  });
  return { discordId };
});
