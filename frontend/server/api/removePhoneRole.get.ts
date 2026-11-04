import { requireUser, skipsDiscordRole } from '../utils/user';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  if (skipsDiscordRole(user)) return { success: true };
  const config = useRuntimeConfig(event);
  return $fetch<{ success: boolean }>(`${config.public.server.api.url}/removePhoneRole`, {
    query: { id: user.discordId }, headers: { 'x-api-secret': config.apiSecret },
  });
});
