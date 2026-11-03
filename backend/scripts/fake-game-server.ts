import fs from 'node:fs';
import readline from 'node:readline';
import { loadEnvironment, parseGameConfig } from '../src/config';
import {
  advanceScenario, createScenarioState, DEFAULT_SWEEP_SECONDS, parseFakeGameArgs, parseReplayLines,
  placeAtDistance, resolveFakeGameEndpoint, SEND_INTERVAL_MS, SWEEP_MAX_DISTANCE, sweepDistance,
  NUMERIC_PLAYER_FIELDS, setPlayerField,
  type FakeGameOptions, type Renames,
} from './fakeGame';

const REQUEST_TIMEOUT_MS = 5_000;
const HELP = `コマンド:
  d <距離>                  2 人目以降と 1 人目の距離
  sweep [秒]                距離を 0〜${SWEEP_MAX_DISTANCE} で往復（既定 ${DEFAULT_SWEEP_SECONDS} 秒周期）
  set <番号|all> <項目> <値>  例: set 1 location.server 2 / set 0 music 2 / set all radio.number 5
  stop / start              送信停止（5 秒後にゲーム外扱い）／再開
  show / help / exit`;

function createSender(endpoint: string, secret?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (secret) headers['x-api-secret'] = secret;
  let lastError = '';
  return async (body: string) => {
    try {
      const response = await fetch(endpoint, { method: 'POST', headers, body, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      await response.arrayBuffer();
      const message = response.ok ? '' : `HTTP ${response.status}`;
      if (message && message !== lastError) console.error(`送信失敗: ${message}`);
      lastError = message;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message !== lastError) console.error(`送信失敗: ${message}`);
      lastError = message;
    }
  };
}

type Sender = ReturnType<typeof createSender>;

async function replayFile(file: string, renames: Renames, send: Sender) {
  const frames = parseReplayLines(fs.readFileSync(file, 'utf8'), renames);
  let index = 0;
  let nextAt = performance.now();
  while (true) {
    const frame = frames[index];
    nextAt += frame.delayMs;
    const delay = Math.max(0, nextAt - performance.now());
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    await send(frame.body);
    index = (index + 1) % frames.length;
    // 同時刻の記録だけでも受信側へ無制限に送り続けないため、周回時に間隔を置く。
    if (index === 0) nextAt += SEND_INTERVAL_MS;
  }
}

interface InteractiveState {
  scenario: ReturnType<typeof createScenarioState>;
  distance: number;
  sweepSeconds: number | null;
  sweepStartedAt: number;
  sending: boolean;
}

function startInteractive(state: InteractiveState) {
  const show = () => {
    console.log(`送信: ${state.sending ? 'ON' : 'OFF'} / 距離: ${state.sweepSeconds === null ? state.distance : `往復 0〜${SWEEP_MAX_DISTANCE} (${state.sweepSeconds}s)`}`);
    console.table(state.scenario.players.map((player, index) => ({ '#': index, ...player })));
  };
  const handlers: Record<string, (args: string[]) => void> = {
    d: ([value]) => { state.distance = Number(value) || 0; state.sweepSeconds = null; },
    sweep: ([seconds]) => { state.sweepSeconds = Number(seconds) || DEFAULT_SWEEP_SECONDS; state.sweepStartedAt = Date.now(); },
    set: ([target, field, value]) => {
      if (!NUMERIC_PLAYER_FIELDS.some(candidate => candidate === field)) {
        console.log(`項目: ${NUMERIC_PLAYER_FIELDS.join(', ')}`);
        return;
      }
      const players = state.scenario.players;
      const targets = target === 'all' ? players : players[Number(target)] ? [players[Number(target)]] : [];
      if (targets.length === 0) { console.log('番号が範囲外'); return; }
      const numeric = Number(value);
      if (value === undefined || !Number.isFinite(numeric)) { console.log('有限数が必要'); return; }
      targets.forEach((player) => { setPlayerField(player, field, numeric); });
    },
    stop: () => { state.sending = false; }, start: () => { state.sending = true; }, show,
    help: () => console.log(HELP), exit: () => process.exit(0),
  };

  console.log(HELP);
  const rl = readline.createInterface({ input: process.stdin, prompt: '> ' });
  rl.prompt();
  rl.on('line', (line) => {
    const [command, ...args] = line.trim().split(/\s+/);
    if (handlers[command]) handlers[command](args);
    else if (command) console.log(HELP);
    rl.prompt();
  });
}

async function runScenario(options: FakeGameOptions, send: Sender) {
  const state: InteractiveState = { scenario: createScenarioState(options.names, options.seed),
    distance: 0, sweepSeconds: null, sweepStartedAt: 0, sending: true };
  const startedAt = Date.now();
  if (options.interactive) startInteractive(state);
  let nextAt = performance.now() + SEND_INTERVAL_MS;
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, nextAt - performance.now())));
    if (state.sending) {
      state.scenario = options.scenario ? advanceScenario(state.scenario, options.scenario, Date.now() - startedAt)
        : { ...state.scenario, players: placeAtDistance(state.scenario.players, state.sweepSeconds === null ? state.distance
          : sweepDistance(Date.now() - state.sweepStartedAt, state.sweepSeconds)) };
      await send(JSON.stringify(state.scenario.players));
    }
    nextAt = Math.max(nextAt + SEND_INTERVAL_MS, performance.now());
  }
}

async function main() {
  loadEnvironment();
  const options = parseFakeGameArgs(process.argv.slice(2));
  const endpoint = resolveFakeGameEndpoint(process.env);
  const send = createSender(endpoint, parseGameConfig(process.env).GAME_API_SECRET);
  if (options.replay) {
    console.log(`${endpoint} へ replay: ${options.replay}`);
    await replayFile(options.replay, options.renames, send);
    return;
  }
  console.log(`${endpoint} へ送信開始: ${options.names.map((name, index) => `#${index} ${name}`).join(', ')}`);
  await runScenario(options, send);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
