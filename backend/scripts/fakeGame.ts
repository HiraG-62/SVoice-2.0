import { parseArgs } from 'node:util';
import type { PlayerData } from '@svoice/shared';
import { parseGameConfig } from '../src/config';

export const SEND_INTERVAL_MS = 200;
export const SWEEP_MAX_DISTANCE = 40;
export const DEFAULT_SWEEP_SECONDS = 20;
const DEFAULT_SEED = 1;
const WALK_STEP = 1;
const RANDOM_MULTIPLIER = 1664525;
const RANDOM_INCREMENT = 1013904223;
const RANDOM_MODULUS = 2 ** 32;
export type Scenario = 'static' | 'sweep' | 'walk';
export type Renames = Readonly<Record<string, string>>;

export interface FakeGameOptions {
  names: string[];
  scenario: Scenario | undefined;
  replay: string | undefined;
  renames: Renames;
  seed: number;
  interactive: boolean;
}

export function parseFakeGameArgs(args: string[]): FakeGameOptions {
  const { values, positionals: names } = parseArgs({ args, allowPositionals: true, options: {
    scenario: { type: 'string' }, replay: { type: 'string' }, rename: { type: 'string', multiple: true },
    seed: { type: 'string' }, 'no-interactive': { type: 'boolean' },
  } });
  const scenario = values.scenario;
  if (scenario !== undefined && scenario !== 'static' && scenario !== 'sweep' && scenario !== 'walk') throw new Error('不明なシナリオ');
  if (values.replay !== undefined && !values.replay) throw new Error('replay ファイルが未指定');
  if (scenario && values.replay) throw new Error('scenario と replay は併用不可');
  if (!values.replay && names.length === 0) throw new Error('ゲーマータグが未指定');
  const seed = values.seed === undefined ? DEFAULT_SEED : Number(values.seed);
  if ((values.seed !== undefined && !/^\d+$/.test(values.seed)) || !Number.isInteger(seed) || seed < 0 || seed >= RANDOM_MODULUS) {
    throw new Error('seed は 0〜4294967295 の整数');
  }
  const renames: Record<string, string> = Object.create(null);
  for (const rename of values.rename ?? []) {
    const separator = rename.indexOf('=');
    if (separator <= 0 || separator === rename.length - 1) throw new Error('rename は 元の名前=新しい名前');
    renames[rename.slice(0, separator)] = rename.slice(separator + 1);
  }
  return { names, scenario, replay: values.replay, renames, seed,
    interactive: !values['no-interactive'] && !scenario && !values.replay };
}

export function resolveFakeGameEndpoint(env: NodeJS.ProcessEnv) {
  const config = parseGameConfig(env);
  return env.FAKE_GAME_ENDPOINT || `http://localhost:${config.GAME_RECEIVER_PORT}/`;
}

export function createPlayer(name: string): PlayerData {
  return {
    name, dimension: 0, x: 0, y: 64, z: 0,
    telephone: 0, hasTelephone: 0, useMegaphone: 0, useMicrophone: 0,
    transceiverType: 0, transceiverNumber: 0, mute: 0,
    voiceRangeOutput: 100, volumeOutput: 100, voiceRangeInput: 100, volumeInput: 100,
  };
}

export function placeAtDistance(players: PlayerData[], distance: number) {
  return players.map((player, index) => ({ ...player, x: index === 0 ? 0 : distance }));
}

export function sweepDistance(elapsedMs: number, seconds = DEFAULT_SWEEP_SECONDS) {
  const phase = elapsedMs / 1000 / seconds * 2 * Math.PI;
  return SWEEP_MAX_DISTANCE / 2 * (1 - Math.cos(phase));
}

export function createScenarioState(names: string[], seed: number) {
  return { players: names.map(createPlayer), seed };
}

export function advanceScenario(state: ReturnType<typeof createScenarioState>, scenario: Scenario, elapsedMs: number) {
  if (scenario === 'static') return { ...state, players: state.players.map(({ name }) => createPlayer(name)) };
  if (scenario === 'sweep') return { ...state, players: placeAtDistance(state.players, sweepDistance(elapsedMs)) };
  let seed = state.seed;
  const step = (position: number) => {
    seed = (Math.imul(seed, RANDOM_MULTIPLIER) + RANDOM_INCREMENT) >>> 0;
    return Math.max(-SWEEP_MAX_DISTANCE, Math.min(SWEEP_MAX_DISTANCE, position + (seed / RANDOM_MODULUS * 2 - 1) * WALK_STEP));
  };
  const players = state.players.map((player) => ({ ...player, x: step(player.x), z: step(player.z) }));
  return { players, seed };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function renamePlayers(value: unknown, renames: Renames): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((player: unknown) => {
    if (!isRecord(player) || typeof player.name !== 'string' || !Object.hasOwn(renames, player.name)) return player;
    return { ...player, name: renames[player.name] };
  });
}

export interface ReplayFrame { delayMs: number; body: string }

export function parseReplayLines(input: string, renames: Renames = {}): ReplayFrame[] {
  let previousTime: number | undefined;
  const frames = input.split(/\r?\n/).filter((line) => line.trim()).map((line, index) => {
    const record: unknown = JSON.parse(line);
    if (!isRecord(record) || typeof record.receivedAt !== 'string') throw new Error(`replay ${index + 1} 行目: 受信時刻が不正`);
    const receivedAt = Date.parse(record.receivedAt);
    if (!Number.isFinite(receivedAt) || (previousTime !== undefined && receivedAt < previousTime)) {
      throw new Error(`replay ${index + 1} 行目: 受信時刻が不正`);
    }
    let body: string;
    if (Object.hasOwn(record, 'json')) body = JSON.stringify(renamePlayers(record.json, renames));
    else if (typeof record.rawBody === 'string') {
      body = record.rawBody;
      if (Object.keys(renames).length > 0) {
        try { body = JSON.stringify(renamePlayers(JSON.parse(body), renames)); } catch {}
      }
    } else throw new Error(`replay ${index + 1} 行目: 本文が未指定`);
    const delayMs = previousTime === undefined ? 0 : receivedAt - previousTime;
    previousTime = receivedAt;
    return { delayMs, body };
  });
  if (frames.length === 0) throw new Error('replay データが空');
  return frames;
}
