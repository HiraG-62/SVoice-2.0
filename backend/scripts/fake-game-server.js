// 手動確認用: ゲームサーバーの代わりにプレイヤーデータを backend (:30000) へ送り続ける
// 使い方: node scripts/fake-game-server.js <ゲーマータグ1> [ゲーマータグ2 ...]
const path = require('path');
const readline = require('readline');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const ENDPOINT = process.env.FAKE_GAME_ENDPOINT || 'http://localhost:30000/';
const SEND_INTERVAL_MS = 200;
const SWEEP_MAX_DISTANCE = 40;
const DEFAULT_SWEEP_SECONDS = 20;
const NUMERIC_FIELDS = ['dimension', 'x', 'y', 'z', 'telephone', 'hasTelephone', 'useMegaphone',
  'useMicrophone', 'transceiverType', 'transceiverNumber', 'mute',
  'voiceRangeOutput', 'volumeOutput', 'voiceRangeInput', 'volumeInput'];

const names = process.argv.slice(2);
if (names.length === 0) {
  console.error('使い方: node scripts/fake-game-server.js <ゲーマータグ1> [ゲーマータグ2 ...]');
  process.exit(1);
}

const createPlayer = (name) => ({
  name, dimension: 0, x: 0, y: 64, z: 0,
  telephone: 0, hasTelephone: 0, useMegaphone: 0, useMicrophone: 0,
  transceiverType: 0, transceiverNumber: 0, mute: 0,
  voiceRangeOutput: 100, volumeOutput: 100, voiceRangeInput: 100, volumeInput: 100,
});

const players = names.map(createPlayer);
let distance = 0;
let sweepSeconds = null;
let sweepStartedAt = 0;
let sending = true;

const currentDistance = () => {
  if (sweepSeconds === null) return distance;
  const phase = ((Date.now() - sweepStartedAt) / 1000 / sweepSeconds) * 2 * Math.PI;
  return (SWEEP_MAX_DISTANCE / 2) * (1 - Math.cos(phase));
};

// 1 人目を原点に置き、2 人目以降を x 軸上の同じ距離に置く
const placePlayers = () => {
  const d = currentDistance();
  players.forEach((p, i) => { p.x = i === 0 ? 0 : d; });
};

let lastError = '';
const send = async () => {
  if (!sending) return;
  placePlayers();
  const headers = { 'content-type': 'application/json' };
  if (process.env.GAME_API_SECRET) headers['x-api-secret'] = process.env.GAME_API_SECRET;
  try {
    const res = await fetch(ENDPOINT, { method: 'POST', headers, body: JSON.stringify(players) });
    const message = res.ok ? '' : `HTTP ${res.status}`;
    if (message && message !== lastError) console.error(`送信失敗: ${message}`);
    lastError = message;
  } catch (err) {
    if (err.message !== lastError) console.error(`送信失敗: ${err.message}`);
    lastError = err.message;
  }
};

const targetsOf = (target) => {
  if (target === 'all') return players;
  const player = players[Number(target)];
  return player ? [player] : [];
};

const show = () => {
  console.log(`送信: ${sending ? 'ON' : 'OFF'} / 距離: ${sweepSeconds === null ? distance : `往復 0〜${SWEEP_MAX_DISTANCE} (${sweepSeconds}s)`}`);
  console.table(players.map(({ name, ...rest }, i) => ({ '#': i, name, ...rest })));
};

const HELP = `コマンド:
  d <距離>                  2 人目以降と 1 人目の距離
  sweep [秒]                距離を 0〜${SWEEP_MAX_DISTANCE} で往復（既定 ${DEFAULT_SWEEP_SECONDS} 秒周期）
  set <番号|all> <項目> <値>  例: set 0 mute 2 / set all telephone 1 / set 1 useMegaphone 1
  stop / start              送信停止（5 秒後にゲーム外扱い）／再開
  show / help / exit`;

const handlers = {
  d: ([value]) => { distance = Number(value) || 0; sweepSeconds = null; },
  sweep: ([seconds]) => { sweepSeconds = Number(seconds) || DEFAULT_SWEEP_SECONDS; sweepStartedAt = Date.now(); },
  set: ([target, field, value]) => {
    if (!NUMERIC_FIELDS.includes(field)) return console.log(`項目: ${NUMERIC_FIELDS.join(', ')}`);
    const targets = targetsOf(target);
    if (targets.length === 0) return console.log('番号が範囲外');
    targets.forEach(p => { p[field] = Number(value); });
  },
  stop: () => { sending = false; },
  start: () => { sending = true; },
  show,
  help: () => console.log(HELP),
  exit: () => process.exit(0),
};

setInterval(send, SEND_INTERVAL_MS);
console.log(`${ENDPOINT} へ送信開始: ${names.map((n, i) => `#${i} ${n}`).join(', ')}`);
console.log(HELP);

const rl = readline.createInterface({ input: process.stdin, prompt: '> ' });
rl.prompt();
rl.on('line', (line) => {
  const [command, ...args] = line.trim().split(/\s+/);
  const handler = handlers[command];
  if (handler) handler(args);
  else if (command) console.log(HELP);
  rl.prompt();
});
