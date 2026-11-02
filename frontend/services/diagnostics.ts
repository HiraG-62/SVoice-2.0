const MAX_DIAGNOSTICS = 50;
type DiagnosticLevel = 'error' | 'warn';
interface DiagnosticEntry { time: string; level: DiagnosticLevel; message: string }

export function errorCode(error: unknown) {
  if (typeof error === 'object' && error !== null && 'info' in error &&
      typeof error.info === 'object' && error.info !== null && 'name' in error.info &&
      typeof error.info.name === 'string') return error.info.name;
  return error instanceof Error ? `${error.name}: ${error.message.slice(0, 200)}` : '不明なエラー';
}

function redact(message: string) {
  return message.replace(/[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g, '[token]');
}

export function createDiagnostics() {
  const entries: DiagnosticEntry[] = [];
  function record(level: DiagnosticLevel, message: string) {
    entries.push({ time: new Date().toISOString(), level, message: redact(message) });
    if (entries.length > MAX_DIAGNOSTICS) entries.splice(0, entries.length - MAX_DIAGNOSTICS);
  }
  function captureConsole() {
    const restores = (['error', 'warn'] as const).map(level => {
      const previous = console[level];
      const replacement = (...args: unknown[]) => {
        const message = args.filter((value): value is string | Error => typeof value === 'string' || value instanceof Error)
          .map(value => typeof value === 'string' ? value : errorCode(value)).join(' ');
        record(level, message || 'ブラウザの警告・エラー');
        previous.apply(console, args);
      };
      console[level] = replacement;
      return () => { if (console[level] === replacement) console[level] = previous; };
    });
    return () => restores.forEach(restore => restore());
  }
  return { record, captureConsole, snapshot: () => entries.map(entry => ({ ...entry })) };
}
