import { parseArgs } from 'node:util';
import { loadEnvironment, parseGameConfig } from '../src/config';
import { resolveFakeGameEndpoint } from './fakeGame';
import { startVoiceLab } from './voiceLab/runtime';
import { DEFAULT_LAB_PORT } from './voiceLab/server';

async function main() {
  loadEnvironment();
  const { values } = parseArgs({ options: { bots: { type: 'string', default: 'Bot1,Bot2,Bot3' },
    listeners: { type: 'string', default: 'Alice,Bob' } } });
  const split = (input: string) => input.split(',').map(name => name.trim()).filter(Boolean);
  const port = Number(process.env.VOICE_LAB_PORT ?? DEFAULT_LAB_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('VOICE_LAB_PORT が不正');
  if (!process.env.SERVER_URL) throw new Error('SERVER_URL が未設定');
  const lab = await startVoiceLab({ listeners: split(values.listeners), bots: split(values.bots),
    frontend: process.env.SERVER_URL, endpoint: resolveFakeGameEndpoint(process.env),
    secret: parseGameConfig(process.env).GAME_API_SECRET, port });
  console.log(`voice-lab: ${lab.url}/`);
  const stop = () => { void lab.close().then(() => { process.exitCode = 0; }).catch(() => { process.exitCode = 1; }); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  process.once('SIGBREAK', stop);
}

void main().catch(() => { console.error('voice-lab 起動失敗: 引数・SERVER_URL・VOICE_LAB_PORT を確認'); process.exitCode = 1; });
