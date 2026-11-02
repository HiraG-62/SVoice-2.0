import { requireAdmin } from '../../utils/user';

export interface JoinLock {
  id: string;
  gamerTag: string;
  failures: number;
  lockedAt: string;
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const config = useRuntimeConfig(event);
  return $fetch<JoinLock[]>(`${config.public.server.api.url}/joinLocks`, {
    headers: { 'x-api-secret': config.apiSecret },
  });
});
