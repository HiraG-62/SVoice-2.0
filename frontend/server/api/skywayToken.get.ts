import { requireUser } from '../utils/user';
import { issueSkywayToken } from '../utils/skywayToken';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const config = useRuntimeConfig(event);
  if (!config.skywayAppId || !config.skywaySecretKey) {
    throw createError({ statusCode: 500, message: 'SkyWay 設定なし' });
  }
  return issueSkywayToken(config.skywayAppId, config.skywaySecretKey, config.public.skywayRoomName, user.gamerTag);
});
