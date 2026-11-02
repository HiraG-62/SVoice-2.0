import fs from 'node:fs';
import path from 'node:path';

export const DEBUG_MAX_BYTES = 64 * 1024;
export const DEBUG_MAX_REQUESTS = 5;
export const DEBUG_WINDOW_MS = 60_000;
export const LOG_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const LOG_MAX_BYTES = 100 * 1024 * 1024;

function pruneLogs(directory: string, now: number) {
  const files = fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
    .map((entry) => {
      const file = path.join(directory, entry.name);
      const stat = fs.statSync(file);
      return { file, size: stat.size, modified: stat.mtimeMs };
    }).sort((a, b) => a.modified - b.modified);
  let size = files.reduce((total, file) => total + file.size, 0);
  for (const file of files) {
    if (now - file.modified <= LOG_RETENTION_MS && size <= LOG_MAX_BYTES) continue;
    fs.unlinkSync(file.file);
    size -= file.size;
  }
}

export function createDebugWriter(directory: string, logger: Pick<Console, 'log'>) {
  return (gamerTag: string, data: unknown, date: Date) => {
    try {
      fs.mkdirSync(directory, { recursive: true });
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      const file = path.join(directory, `${yyyy}-${mm}-${dd}.jsonl`);
      fs.appendFileSync(file, JSON.stringify({ receivedAt: date.toISOString(), gamerTag, data }) + '\n');
      pruneLogs(directory, date.getTime());
    } catch {
      logger.log('debug 保存失敗');
    }
  };
}

export function createDebugLimiter() {
  const accepted: number[] = [];
  return (data: unknown, now: number): boolean => {
    let serialized: string | undefined;
    try { serialized = JSON.stringify(data); } catch { return false; }
    if (serialized === undefined || Buffer.byteLength(serialized, 'utf8') > DEBUG_MAX_BYTES) return false;
    while (accepted.length && now - accepted[0] >= DEBUG_WINDOW_MS) accepted.shift();
    if (accepted.length >= DEBUG_MAX_REQUESTS) return false;
    accepted.push(now);
    return true;
  };
}
