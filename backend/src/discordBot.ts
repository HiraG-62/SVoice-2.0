import type { PlayerData } from '@svoice/shared';
import type { BackendConfig } from './config';
import { createDiscordApp, createDiscordServers, listenDiscordServers } from './internalApi';
import { createBotPool, loadBots } from './discord/bots';
import { startMemberCount } from './discord/memberCount';
import type { Server } from 'node:http';
import type { Client } from 'discord.js';

export { createDiscordApp, createDiscordServers, listenDiscordServers, validateDiscordId, type DiscordMember } from './internalApi';
export { calculateBotIndex } from './discord/memberCount';
export { loginWithRetry } from './discord/bots';

export function createDiscordService(config: BackendConfig, getData: () => PlayerData[] | null | undefined,
  { onServer = () => {} }: { onServer?: (server: Server) => void } = {}) {
  const controller = new AbortController();
  const clients = new Set<Client>();
  let stopMemberCount = () => {};
  let closing: Promise<void> | undefined;
  const activeConfig = { ...config };
  let starting = config.DISCORD_ENABLED;
  let pool = createBotPool([], config.DISCORD_SERVER_ID);
  const app = createDiscordApp({ config: activeConfig, isStarting: () => starting,
    fetchGuild: () => pool.fetchGuild(), nextBot: () => pool.nextBot() });
  const servers = createDiscordServers(app, config);
  onServer(servers.httpServer);
  onServer(servers.server);
  const ready = listenDiscordServers(servers, config).then(() => servers);
  const botsReady = (async () => {
    const bots = config.DISCORD_ENABLED ? await loadBots(config.DISCORD_TOKENS_PATH, {
      signal: controller.signal, onBot: bot => { clients.add(bot); },
    }) : [];
    if (controller.signal.aborted) return;
    if (!config.DISCORD_ENABLED) console.log('Discord 機能は無効');
    else if (!bots.length) console.error('Discord 利用不可: Bot なし');

    activeConfig.DISCORD_ENABLED = config.DISCORD_ENABLED && bots.length > 0;
    pool = createBotPool(bots, config.DISCORD_SERVER_ID);
    starting = false;
    stopMemberCount = startMemberCount(activeConfig, bots, getData);
  })();
  const close = () => closing ??= (async () => {
    controller.abort();
    stopMemberCount();
    await Promise.all([
      ...[...clients].map(bot => bot.destroy()),
      botsReady,
      ready.catch(() => {}).then(() => Promise.all([servers.httpServer, servers.server].map(server => new Promise<void>(resolve => {
        server.close(() => resolve());
      })))),
    ]);
  })();
  const onClose = () => {
    if (controller.signal.aborted) return;
    if (servers.httpServer.listening || servers.server.listening) return;
    void close();
  };
  servers.httpServer.on('close', onClose);
  servers.server.on('close', onClose);
  return { ready, botsReady, close };
}

export async function startDiscordServer(config: BackendConfig, getData: () => PlayerData[] | null | undefined) {
  const servers = await createDiscordService(config, getData).ready;
  if (!servers) throw new Error('Discord 起動の中止');
  return servers;
}
