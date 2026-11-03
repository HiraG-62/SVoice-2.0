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
  let servers: ReturnType<typeof createDiscordServers> | undefined;
  let closing: Promise<void> | undefined;
  const ready = (async () => {
    const bots = config.DISCORD_ENABLED ? await loadBots(config.DISCORD_TOKENS_PATH, {
      signal: controller.signal, onBot: bot => { clients.add(bot); },
    }) : [];
    if (controller.signal.aborted) return;
    if (!config.DISCORD_ENABLED) console.log('Discord 機能は無効');
    else if (!bots.length) console.error('Discord 利用不可: Bot なし');

    const activeConfig = { ...config, DISCORD_ENABLED: config.DISCORD_ENABLED && bots.length > 0 };
    const pool = createBotPool(bots, config.DISCORD_SERVER_ID);
    stopMemberCount = startMemberCount(activeConfig, bots, getData);
    const app = createDiscordApp({ config: activeConfig, ...pool });
    servers = createDiscordServers(app, config);
    const activeServers = servers;
    onServer(servers.httpServer);
    onServer(servers.server);
    const close = () => {
      if (controller.signal.aborted) return;
      if (activeServers.httpServer.listening || activeServers.server.listening) return;
      stopMemberCount();
      for (const bot of bots) void bot.destroy();
    };
    servers.httpServer.on('close', close);
    servers.server.on('close', close);
    listenDiscordServers(servers, config);
    return servers;
  })();
  const close = () => closing ??= (async () => {
    controller.abort();
    stopMemberCount();
    await Promise.all([...clients].map(bot => bot.destroy()));
    await ready.catch(() => {});
    stopMemberCount();
    if (servers) await Promise.all([servers.httpServer, servers.server].map(server => new Promise<void>(resolve => {
      server.close(() => resolve());
    })));
  })();
  return { ready, close };
}

export async function startDiscordServer(config: BackendConfig, getData: () => PlayerData[] | null | undefined) {
  const servers = await createDiscordService(config, getData).ready;
  if (!servers) throw new Error('Discord 起動の中止');
  return servers;
}
