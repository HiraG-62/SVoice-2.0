export const REQUIRED_CONFIG_KEYS = [
  'NUXT_APP_SECRET',
  'NUXT_SKYWAY_APP_ID',
  'NUXT_SKYWAY_SECRET_KEY',
  'NUXT_API_SECRET',
  'NUXT_PUBLIC_SERVER_SOCKET_URL',
  'NUXT_PUBLIC_SERVER_API_URL',
  'NUXT_OAUTH_DISCORD_CLIENT_ID',
  'NUXT_OAUTH_DISCORD_CLIENT_SECRET',
  'NUXT_OAUTH_DISCORD_REDIRECT_URL',
] as const;

export function findMissingConfig(config: Readonly<Record<string, string | undefined>>) {
  return REQUIRED_CONFIG_KEYS.filter(key => !config[key]);
}
