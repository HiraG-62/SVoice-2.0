import { describe, expect, it, vi } from 'vitest';
import { createDiagnostics } from '../services/diagnostics';
import { parseDebugLogArgs, parseDebugRecords } from '../../backend/scripts/debugLog';

describe('デバッグ情報', () => {
  it('直近50件のエラー・警告を時刻付きで保持する', () => {
    const diagnostics = createDiagnostics();
    for (let i = 0; i < 60; i++) diagnostics.record('warn', `警告${i}`);
    const entries = diagnostics.snapshot();
    expect(entries).toHaveLength(50);
    expect(entries[0]!.message).toBe('警告10');
    expect(Date.parse(entries[0]!.time)).toBeGreaterThan(0);
    entries[0]!.message = '書き換え';
    expect(diagnostics.snapshot()[0]!.message).toBe('警告10');
  });
  it('タグで絞り込み、壊れた行を無視する', () => {
    const record = { receivedAt: '2026-11-03T00:00:00Z', gamerTag: 'Alice', data: { self: {} } };
    expect(parseDebugRecords(`壊れた行\n${JSON.stringify(record)}\n{}\n`, 'Alice')).toEqual([record]);
    expect(parseDebugRecords(JSON.stringify(record), 'Bob')).toEqual([]);
  });
  it('実在する日付とタグを受け付ける', () => {
    expect(parseDebugLogArgs(['--tag', 'Alice Bob', '--date', '2026-11-03'])).toMatchObject({ tag: 'Alice Bob', date: '2026-11-03' });
    expect(() => parseDebugLogArgs(['--date', '../.env'])).toThrow('日付');
    expect(() => parseDebugLogArgs(['--date', '2026-02-30'])).toThrow('日付');
  });
  it('consoleの警告も記録し、解除時に復元する', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const diagnostics = createDiagnostics();
    const restore = diagnostics.captureConsole();
    console.warn('警告');
    expect(diagnostics.snapshot()[0]!.message).toBe('警告');
    restore();
    expect(console.warn).toBe(warn);
    warn.mockRestore();
  });
});
