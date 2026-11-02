import fs from 'node:fs';
import path from 'node:path';
import { loadEnvironment, resolveBackendPath } from '../src/config';
import { parseDebugLogArgs, parseDebugRecords } from './debugLog';

try {
  const options = parseDebugLogArgs(process.argv.slice(2));
  loadEnvironment();
  const directory = path.join(resolveBackendPath(process.env.DATA_DIR ?? '.'), 'logs');
  const files = fs.existsSync(directory) ? fs.readdirSync(directory)
    .filter(file => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(file) && (!options.date || file === `${options.date}.jsonl`)).sort() : [];
  const records = files.flatMap(file => parseDebugRecords(fs.readFileSync(path.join(directory, file), 'utf8'), options.tag));
  for (const record of records) {
    console.log(`${record.receivedAt}  ${record.gamerTag}`);
    console.log(JSON.stringify(record.data, null, 2));
  }
  if (!records.length) console.log('ログなし');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'ログの読み込み失敗');
  process.exitCode = 1;
}
