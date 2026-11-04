import type { H3Event } from 'h3';
import { createAdminChecker } from './adminPolicy';

const checkAdmin = createAdminChecker();

export async function requireUser(event: H3Event) {
  const { user } = await getUserSession(event);
  if (!user) throw createError({ statusCode: 401, message: '未ログイン' });
  return user;
}

// 開発用ログインの discordId は Discord に存在しないため、ロール操作は DISCORD_ENABLED=false と同じ結果にする
export function skipsDiscordRole(user: { devLogin?: boolean }): boolean {
  return user.devLogin === true;
}

export async function isAdmin(event: H3Event): Promise<boolean> {
  const user = await requireUser(event);
  const config = useRuntimeConfig(event);
  return checkAdmin(user, id => $fetch<boolean>(`${config.public.server.api.url}/checkAdminRole`, {
    query: { id }, headers: { 'x-api-secret': config.apiSecret },
  }));
}

export async function requireAdmin(event: H3Event) {
  if (!await isAdmin(event)) throw createError({ statusCode: 403, message: '管理者権限が必要' });
}
