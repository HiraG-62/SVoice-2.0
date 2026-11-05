import { format } from 'node:util';

const MILLISECONDS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug'];
const installedConsoles = new WeakSet();

export function formatLocalTime(date = new Date(), timezoneOffset = date.getTimezoneOffset()) {
  const local = new Date(date.getTime() - timezoneOffset * MILLISECONDS_PER_MINUTE);
  const offset = Math.abs(timezoneOffset);
  const hours = String(Math.floor(offset / MINUTES_PER_HOUR)).padStart(2, '0');
  const minutes = String(offset % MINUTES_PER_HOUR).padStart(2, '0');
  const sign = timezoneOffset > 0 ? '-' : '+';
  return `${local.toISOString().slice(0, -1)}${sign}${hours}:${minutes}`;
}

export function installConsoleTime(target = console, now = () => new Date()) {
  if (installedConsoles.has(target)) return;
  for (const method of CONSOLE_METHODS) {
    const original = target[method].bind(target);
    target[method] = (...args) => original(`${formatLocalTime(now())} ${format(...args)}`);
  }
  installedConsoles.add(target);
}
