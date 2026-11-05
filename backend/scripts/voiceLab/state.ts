import type { IngameSettings, PlayerData } from '@svoice/shared';
import { evaluatePlayerVolume, getDistance, shouldSubscribe, type VolumeReason } from '../../../frontend/services/volume';
import { createPlayer, setPlayerField } from '../fakeGame';

const BOT_SPACING = 5;
const MAX_NAME_LENGTH = 100;
export type RowKind = 'listener' | 'bot';
export interface BotState { status: 'starting' | 'joined' | 'error'; speaker: boolean; message: string }
export interface LabRow { kind: RowKind; included: boolean; player: PlayerData; bot?: BotState }
export const REASONS: Record<VolumeReason, { step: number | null; label: string }> = {
  admin: { step: 1, label: '全体発言' }, offGame: { step: 2, label: 'ゲーム外' },
  server: { step: 3, label: 'サーバー違い' }, music: { step: 4, label: '音楽ミュート' },
  phone: { step: 5, label: '同じ番号で通話' }, transceiver: { step: 8, label: 'トランシーバー' },
  radio: { step: 9, label: 'ラジオ' }, dimension: { step: 10, label: 'ディメンション違い' },
  distance: { step: 11, label: '距離' }, settingsMissing: { step: null, label: '距離設定なし' },
};

export function createLabState(listeners: string[], bots: string[]) {
  const rows: LabRow[] = [];
  let botIndex = 0;
  const state = {
    rows, listener: '', sending: true, frontend: 'frontend 待ち', lastSend: '未送信', settingsError: '',
    find(name: string) {
      const row = rows.find(row => row.player.name === name);
      if (!row) throw new Error('プレイヤーなし');
      return row;
    },
    add(name: string, kind: RowKind) {
      if (!name.trim() || name.length > MAX_NAME_LENGTH) throw new Error('ゲーマータグは 1〜100 文字');
      if (rows.some(row => row.player.name === name)) throw new Error('ゲーマータグ重複');
      const player = createPlayer(name);
      if (kind === 'bot') player.location.coordinates.x = ++botIndex * BOT_SPACING;
      const row: LabRow = { player, kind, included: true,
        ...(kind === 'bot' ? { bot: { status: 'starting', speaker: false, message: '' } as BotState } : {}) };
      rows.push(row);
      if (!state.listener) state.listener = name;
      return row;
    },
    remove(name: string) {
      const row = state.find(name);
      rows.splice(rows.indexOf(row), 1);
      if (state.listener === name) state.listener = rows.find(row => row.kind === 'listener')?.player.name ?? rows[0]?.player.name ?? '';
    },
    select(name: string) { state.find(name); state.listener = name; },
    include(name: string, included: boolean) { state.find(name).included = included; },
    update(name: string, field: string, value: unknown) {
      if (typeof value !== 'number' || !setPlayerField(state.find(name).player, field, value)) throw new Error('項目または数値が不正');
    },
    players() { return state.sending ? rows.filter(row => row.included).map(row => row.player) : []; },
  };
  listeners.forEach(name => state.add(name, 'listener'));
  bots.forEach(name => state.add(name, 'bot'));
  return state;
}
export type LabState = ReturnType<typeof createLabState>;

export function decisions(state: LabState, settings: IngameSettings | null) {
  const players = state.players();
  const self = players.find(player => player.name === state.listener);
  const distances = self ? getDistance(self, players) : new Map<string, number>();
  return state.rows.filter(row => row.player.name !== state.listener).map(row => {
    const other = players.find(player => player.name === row.player.name);
    const admin = row.bot?.status === 'joined' && row.bot.speaker;
    const distance = distances.get(row.player.name) ?? null;
    const result = evaluatePlayerVolume(self, other, distance ?? 0, settings, admin);
    return { name: row.player.name, distance, ...result, ...REASONS[result.reason],
      subscribe: shouldSubscribe(!!self, admin, result.volume) };
  });
}
