import type { Client } from 'discord.js';
import { joinVoiceChannel, type VoiceConnection } from '@discordjs/voice';
import type { PlayerData } from '@svoice/shared';
import type { BackendConfig } from '../config';

const MEMBER_DISPLAY_INTERVAL_MS = 10_000;
const INITIAL_VOICE_DELAY_MS = 3_000;
const MAX_DISPLAY_PLAYER_COUNT = 20;

export function calculateBotIndex(playerCount: number, botsLength: number): number {
  const maxIndex = botsLength - 1;
  // Botインデックスを安全に決定（bots配列の範囲内に収める）
  return Math.min(playerCount >= MAX_DISPLAY_PLAYER_COUNT ? MAX_DISPLAY_PLAYER_COUNT : playerCount, maxIndex);
}

export function startMemberCount(config: BackendConfig, bots: Client[], getData: () => PlayerData[] | null | undefined) {
  if (!config.DISCORD_MEMBER_COUNT_ENABLED || !bots.length) return () => {};
  let connection: VoiceConnection | undefined;
  let count: number | undefined;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const display = async () => {
    try {
      const playerCount = getData()?.length ?? 0;
      if (count === playerCount || (count !== undefined && count >= MAX_DISPLAY_PLAYER_COUNT && playerCount >= MAX_DISPLAY_PLAYER_COUNT)) return;
      const bot = bots[calculateBotIndex(playerCount, bots.length)];
      const guild = await bot.guilds.fetch(config.DISCORD_SERVER_ID);
      const channel = guild.channels.cache.get(config.DISCORD_SERVER_ROOM_ID);
      if (!channel) throw new Error('Voice channel missing');
      if (stopped) return;
      connection?.destroy();
      connection = joinVoiceChannel({ channelId: channel.id, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator });
      count = playerCount;
    } catch { console.error('人数表示失敗'); }
    finally { if (!stopped) timer = setTimeout(() => { void display(); }, MEMBER_DISPLAY_INTERVAL_MS); }
  };
  timer = setTimeout(() => { void display(); }, INITIAL_VOICE_DELAY_MS);
  return () => { stopped = true; clearTimeout(timer); connection?.destroy(); };
}
