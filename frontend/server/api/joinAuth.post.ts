import type { JoinAuthResult } from '../../utils/authMessages';
import { requireUser } from '../utils/user';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const body = await readBody<unknown>(event);
  if (!body || typeof body !== 'object' || !('pass' in body) || typeof body.pass !== 'string') {
    throw createError({ statusCode: 400, message: 'パスワード形式不正' });
  }
  const config = useRuntimeConfig(event);
  return $fetch<JoinAuthResult>(`${config.public.server.api.url}/joinAuth`, {
    method: 'POST', body: { pass: body.pass, id: user.discordId, gamerTag: user.gamerTag },
    headers: { 'x-api-secret': config.apiSecret },
  });
});
