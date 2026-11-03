export const STOP_TIMEOUT_MS = 15_000;

export function createLifecycle(host = process, { timeoutMs = STOP_TIMEOUT_MS, logger = console } = {}) {
  const closers = [];
  let stopping;
  let exitCode = 0;
  const stop = (code = 0) => {
    exitCode = Math.max(exitCode, code);
    if (stopping) return stopping;
    const timeout = setTimeout(() => {
      logger.error('終了処理のタイムアウト');
      host.exit(1);
    }, timeoutMs);
    stopping = Promise.allSettled(closers.map(close => {
      try { return close(); } catch (error) { return Promise.reject(error); }
    })).then(results => {
      if (results.some(result => result.status === 'rejected')) exitCode = 1;
      clearTimeout(timeout);
      host.exit(exitCode);
    });
    return stopping;
  };
  const fail = error => {
    logger.error(`アプリ異常終了: ${error instanceof Error ? error.message : String(error)}`);
    return stop(1);
  };
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK']) host.on(signal, () => { void stop(); });
  host.on('uncaughtException', fail);
  host.on('unhandledRejection', fail);
  return { add: close => closers.push(close), stop, fail, get stopping() { return Boolean(stopping); } };
}

export function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close(error => {
      if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') reject(error);
      else resolve();
    });
  });
}
