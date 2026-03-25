import { defineEventHandler, getQuery } from 'h3'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);

  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const config = useRuntimeConfig();
  const appId = config.skywayAppId;
  const secretKey = config.skywaySecretKey;

  if (!appId || !secretKey) {
    throw createError({ statusCode: 500, message: 'SkyWay configuration missing' });
  }

  return {
    appId,
    secretKey,
  };
})
