import { defineEventHandler, readBody } from 'h3'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const config = useRuntimeConfig();
  const body = await readBody(event);

  const res = await $fetch(`${config.public.server.api.url}/checkJoinPass`, {
    method: 'POST',
    body,
    headers: { 'x-api-secret': config.apiSecret }
  });

  return res;
})
