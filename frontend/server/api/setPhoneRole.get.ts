import { defineEventHandler, getQuery } from 'h3'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const config = useRuntimeConfig();
  const { id } = getQuery(event);

  const res = await $fetch(`${config.public.server.api.url}/setPhoneRole?id=${id}`, {
    headers: { 'x-api-secret': config.apiSecret }
  });

  return res;
})
