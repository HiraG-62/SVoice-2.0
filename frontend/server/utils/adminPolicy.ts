const ADMIN_CACHE_MS = 30_000;

interface AdminUser {
  discordId: string;
  discordAuth: boolean;
  devLogin?: boolean;
}

export function createAdminChecker(now: () => number = Date.now) {
  const cache = new Map<string, { admin: boolean; expires: number }>();
  return async (user: AdminUser, fetchAdmin: (id: string) => Promise<boolean>): Promise<boolean> => {
    if (user.devLogin === true) return user.discordAuth;
    const cached = cache.get(user.discordId);
    if (cached && cached.expires > now()) return cached.admin;
    const admin = await fetchAdmin(user.discordId);
    for (const [id, entry] of cache) {
      if (entry.expires <= now()) cache.delete(id);
    }
    cache.set(user.discordId, { admin, expires: now() + ADMIN_CACHE_MS });
    return admin;
  };
}
