import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function createSettingStore(dataDir: string, cwd = process.cwd(), logger: Pick<Console, 'log'> = console) {
  const directory = resolve(cwd, dataDir);
  const file = join(directory, 'setting.json');
  logger.log(`距離設定データ: ${directory}`);
  if (existsSync(file)) return { file };

  mkdirSync(directory, { recursive: true });
  const legacy = join(cwd, 'settings/setting.json');
  const source = existsSync(legacy) ? legacy : join(cwd, 'settings/default.json');
  copyFileSync(source, file);
  logger.log(`距離設定の移行: ${source} → ${file}`);
  return { file };
}

let settingStore: ReturnType<typeof createSettingStore> | undefined;

export function getSettingStore(dataDir: string) {
  return settingStore ??= createSettingStore(dataDir);
}
