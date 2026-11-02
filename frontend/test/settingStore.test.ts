import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createSettingStore } from '../server/utils/settingStore';

function setup() {
  const cwd = mkdtempSync(join(tmpdir(), 'svoice-setting-'));
  mkdirSync(join(cwd, 'settings'));
  writeFileSync(join(cwd, 'settings/default.json'), '{"default":true}');
  const logger = { log: vi.fn() };
  return { cwd, logger };
}

describe('距離設定の移行', () => {
  it('旧設定を優先し、データフォルダーを作成する', () => {
    const { cwd, logger } = setup();
    writeFileSync(join(cwd, 'settings/setting.json'), '{"legacy":true}');
    const store = createSettingStore('data/dev', cwd, logger);
    expect(readFileSync(store.file, 'utf8')).toBe('{"legacy":true}');
    expect(store.file).toBe(join(cwd, 'data/dev/setting.json'));
    expect(readFileSync(join(cwd, 'settings/setting.json'), 'utf8')).toBe('{"legacy":true}');
    expect(logger.log).toHaveBeenCalledTimes(2);
  });

  it('旧設定がなければデフォルトを使い、絶対パスも受け付ける', () => {
    const { cwd, logger } = setup();
    const store = createSettingStore(join(cwd, 'absolute'), cwd, logger);
    expect(readFileSync(store.file, 'utf8')).toBe('{"default":true}');
  });

  it('移行済みなら上書きせず、パスだけをログに出す', () => {
    const { cwd, logger } = setup();
    mkdirSync(join(cwd, 'data'));
    writeFileSync(join(cwd, 'data/setting.json'), '{"saved":true}');
    const store = createSettingStore('data', cwd, logger);
    expect(readFileSync(store.file, 'utf8')).toBe('{"saved":true}');
    expect(logger.log).toHaveBeenCalledTimes(1);
  });
});
