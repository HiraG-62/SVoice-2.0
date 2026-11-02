import { requireAdmin } from '../../utils/user';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const body = await readBody<unknown>(event);
  if (!body || typeof body !== 'object' || !('id' in body) || typeof body.id !== 'string' || !/^\d{17,20}$/.test(body.id)) {
    throw createError({ statusCode: 400, message: 'Discord ID 形式不正' });
  }
  const config = useRuntimeConfig(event);
  return $fetch<{ success: boolean }>(`${config.public.server.api.url}/unlockJoin`, {
    method: 'POST', body: { id: body.id }, headers: { 'x-api-secret': config.apiSecret },
  });
});
