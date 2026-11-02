import { requireUser } from '../utils/user';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const config = useRuntimeConfig(event);
  return $fetch<boolean>(`${config.public.server.api.url}/getJoinRole`, {
    query: { id: user.discordId }, headers: { 'x-api-secret': config.apiSecret },
  });
});
