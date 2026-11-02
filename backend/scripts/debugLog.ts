import { parseArgs } from 'node:util';

interface DebugRecord { receivedAt: string; gamerTag: string; data: unknown }
export function parseDebugLogArgs(args: string[]) {
  const { values } = parseArgs({ args, options: { tag: { type: 'string' }, date: { type: 'string' } } });
  if (values.date && (!/^\d{4}-\d{2}-\d{2}$/.test(values.date) ||
      !Number.isFinite(Date.parse(values.date)) || new Date(values.date).toISOString().slice(0, 10) !== values.date)) {
    throw new Error('日付は YYYY-MM-DD');
  }
  return values;
}

export function parseDebugRecords(content: string, tag?: string): DebugRecord[] {
  const records: DebugRecord[] = [];
  for (const line of content.split(/\r?\n/).filter(Boolean)) {
    let value: unknown;
    try { value = JSON.parse(line); } catch { continue; }
    if (typeof value !== 'object' || value === null || !('receivedAt' in value) || !('gamerTag' in value) || !('data' in value)) continue;
    if (typeof value.receivedAt !== 'string' || typeof value.gamerTag !== 'string') continue;
    if (tag && value.gamerTag !== tag) continue;
    records.push({ receivedAt: value.receivedAt, gamerTag: value.gamerTag, data: value.data });
  }
  return records;
}
