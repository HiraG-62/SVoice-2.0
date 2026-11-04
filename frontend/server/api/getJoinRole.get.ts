import { requireUser, skipsDiscordRole } from '../utils/user';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  if (skipsDiscordRole(user)) return true;
  const config = useRuntimeConfig(event);
  return $fetch<boolean>(`${config.public.server.api.url}/getJoinRole`, {
    query: { id: user.discordId }, headers: { 'x-api-secret': config.apiSecret },
  });
});
