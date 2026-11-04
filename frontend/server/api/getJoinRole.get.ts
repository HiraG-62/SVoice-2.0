import { setResponseStatus } from 'h3';
import { DISCORD_STARTING } from '../../utils/authMessages';
import { requireUser, skipsDiscordRole } from '../utils/user';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  if (skipsDiscordRole(user)) return true;
  const config = useRuntimeConfig(event);
  try {
    return await $fetch<boolean>(`${config.public.server.api.url}/getJoinRole`, {
      query: { id: user.discordId }, headers: { 'x-api-secret': config.apiSecret },
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 503
      && 'data' in error && error.data && typeof error.data === 'object'
      && 'error' in error.data && error.data.error === DISCORD_STARTING) {
      setResponseStatus(event, 503);
      return { error: DISCORD_STARTING };
    }
    throw error;
  }
});
