import net from 'node:net';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { userInfo } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { STOP_TIMEOUT_MS } from './lifecycle.mjs';

const SERVICE_ID = 'SyakasabaVoice';
const TOKEN_BYTES = 32;
const TOKEN_FILE = 'stop.token';
const REQUEST_TIMEOUT_MS = 1000;
const EXIT_POLL_MS = 50;
const TOKEN_PATTERN = /^[a-f0-9]{64}\n$/;
const ACK_PATTERN = /^stopping:([1-9][0-9]*)\n$/;

export function stopPipePath(root, identity) {
  const account = userInfo();
  const owner = identity ?? `${account.username}\0${account.homedir}`.toLowerCase();
  const hash = createHash('sha256').update(`${SERVICE_ID}\0${realpathSync(root).toLowerCase()}\0${owner}`).digest('hex');
  return `\\\\.\\pipe\\${SERVICE_ID}-${hash}`;
}

export function createStopController({ root, dataDir, onStop, logger = console }) {
  const path = stopPipePath(root);
  const tokenPath = join(dataDir, TOKEN_FILE);
  const token = randomBytes(TOKEN_BYTES);
  const sockets = new Set();
  let tokenWritten = false;
  let closing;
  const server = net.createServer(socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    socket.setTimeout(REQUEST_TIMEOUT_MS, () => socket.destroy());
    let message = '';
    let answered = false;
    socket.on('data', chunk => {
      if (answered) return;
      message += chunk.toString('ascii');
      if (message.length < TOKEN_BYTES * 2 + 1 && !message.includes('\n')) return;
      answered = true;
      if (!TOKEN_PATTERN.test(message) || !timingSafeEqual(Buffer.from(message.trim(), 'hex'), token)) {
        logger.warn('停止要求の拒否');
        socket.end('denied\n');
        return;
      }
      socket.setTimeout(0);
      socket.end(`stopping:${process.pid}\n`, () => { void onStop(); });
    });
  });
  const ready = (async () => {
    await mkdir(dataDir, { recursive: true });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen({ path, readableAll: false, writableAll: false }, resolve);
    });
    await writeFile(tokenPath, token, { mode: 0o600 });
    tokenWritten = true;
  })();
  const close = () => closing ??= (async () => {
    await ready.catch(() => {});
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(() => resolve()));
    if (tokenWritten) await unlink(tokenPath).catch(error => { if (error.code !== 'ENOENT') throw error; });
  })();
  return { ready, close, path };
}

export async function requestStop({ root, dataDir, timeoutMs = STOP_TIMEOUT_MS }) {
  let socket;
  let timer;
  const controller = new AbortController();
  const operation = async () => {
    const token = await readFile(join(dataDir, TOKEN_FILE)).catch(() => { throw new Error('停止用トークンの読み込み失敗'); });
    if (token.length !== TOKEN_BYTES) throw new Error('停止用トークンの不正');
    const pid = await new Promise((resolve, reject) => {
      socket = net.createConnection(stopPipePath(root));
      let message = '';
      socket.on('connect', () => socket.write(`${token.toString('hex')}\n`));
      socket.on('error', () => reject(new Error('停止対象への接続失敗')));
      socket.on('data', chunk => {
        message += chunk.toString('ascii');
        if (message.length > 64) { reject(new Error('停止応答の不正')); socket.destroy(); }
      });
      socket.on('end', () => {
        const match = message.match(ACK_PATTERN);
        if (!match) { reject(new Error('停止要求の拒否')); return; }
        const target = Number(match[1]);
        if (!Number.isSafeInteger(target)) { reject(new Error('停止応答の不正')); return; }
        resolve(target);
      });
    });
    while (!controller.signal.aborted) {
      try { process.kill(pid, 0); }
      catch (error) { if (error.code === 'ESRCH') return; if (error.code !== 'EPERM') throw error; }
      await delay(EXIT_POLL_MS, undefined, { signal: controller.signal });
    }
  };
  try {
    await Promise.race([operation(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('停止のタイムアウト')), timeoutMs);
    })]);
  } finally {
    clearTimeout(timer);
    controller.abort();
    socket?.destroy();
  }
}
