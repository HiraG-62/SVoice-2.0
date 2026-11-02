import type { PlayerData } from '@svoice/shared';
import type { BackendConfig } from './config';
import { createDiscordApp, createDiscordServers, listenDiscordServers } from './internalApi';
import { createBotPool, loadBots } from './discord/bots';
import { startMemberCount } from './discord/memberCount';

export { createDiscordApp, createDiscordServers, listenDiscordServers, validateDiscordId, type DiscordMember } from './internalApi';
export { calculateBotIndex } from './discord/memberCount';
export { loginWithRetry } from './discord/bots';

export async function startDiscordServer(config: BackendConfig, getData: () => PlayerData[] | null | undefined) {
  const bots = config.DISCORD_ENABLED ? await loadBots(config.DISCORD_TOKENS_PATH) : [];
  if (!config.DISCORD_ENABLED) console.log('Discord 機能は無効');
  else if (!bots.length) console.error('Discord 利用不可: Bot なし');

  const activeConfig = { ...config, DISCORD_ENABLED: config.DISCORD_ENABLED && bots.length > 0 };
  const pool = createBotPool(bots, config.DISCORD_SERVER_ID);
  const stopMemberCount = startMemberCount(activeConfig, bots, getData);
  const app = createDiscordApp({ config: activeConfig, ...pool });
  const servers = createDiscordServers(app, config);
  const close = () => {
    if (servers.httpServer.listening || servers.server.listening) return;
    stopMemberCount();
    for (const bot of bots) void bot.destroy();
  };
  servers.httpServer.on('close', close);
  servers.server.on('close', close);
  listenDiscordServers(servers, config);
  return servers;
}
