import { existsSync, mkdtempSync, readFileSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@svoice/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSocketServer, startSocket } from '../src/socketServer';
import { config, player } from './fixtures';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
const clients: ClientSocket[] = [];
let server: ReturnType<typeof createSocketServer>;
let url: string;
let logsDirectory: string;
let getData: ReturnType<typeof vi.fn<() => typeof player[]>>;

function once<T>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event as 'joined', resolve as (data: (string | null)[]) => void));
}

async function connect(name: string): Promise<ClientSocket> {
  const socket: ClientSocket = io(url, { transports: ['websocket'], forceNew: true });
  clients.push(socket);
  await once(socket, 'connect');
  const joined = once(socket, 'joined');
  socket.emit('join', name);
  await joined;
  return socket;
}

beforeEach(async () => {
  logsDirectory = mkdtempSync(path.join(tmpdir(), 'svoice-socket-test-'));
  getData = vi.fn(() => [player]);
  server = createSocketServer({ config: { ...config, DATA_DIR: logsDirectory }, getData, now: () => new Date(2026, 10, 3, 12), logger: { log: vi.fn() } });
  await startSocket(server, 0);
  const address = server.server.address();
  if (!address || typeof address === 'string') throw new Error('ポート取得失敗');
  url = `http://localhost:${address.port}`;
});

afterEach(async () => {
  clients.splice(0).forEach((client) => client.disconnect());
  await new Promise<void>((resolve) => server.io.close(() => resolve()));
  const logFile = path.join(logsDirectory, 'logs', '2026-11-03.jsonl');
  if (existsSync(logFile)) unlinkSync(logFile);
  if (existsSync(path.join(logsDirectory, 'logs'))) rmdirSync(path.join(logsDirectory, 'logs'));
  rmdirSync(logsDirectory);
});

describe('socketServer', () => {
  it('join → joined で現在の全体発言者を返す', async () => {
    const speaker = await connect('Speaker');
    const speakers = once(speaker, 'setAdminSpeaker');
    speaker.emit('onSpeaker');
    await speakers;
    const socket = await connect('Player');
    const joined = once(socket, 'joined');
    socket.emit('join', 'Player');
    expect(await joined).toEqual(['Speaker']);
  });

  it('join 後に playerData を受け取る', async () => {
    const socket = await connect('Player');
    expect(await once(socket, 'playerData')).toEqual([player]);
  });

  it.each(['', null, 123, 'x'.repeat(101)])('不正な join は登録済みのタグを変えない: %s', async (invalid) => {
    const socket = await connect('Player');
    socket.emit('join', invalid as string);
    const speakers = once(socket, 'setAdminSpeaker');
    socket.emit('onSpeaker');
    expect(await speakers).toEqual(['Player']);
  });

  it.each(['', null, 123])('不正な kick は対象に通知しない: %s', async (invalid) => {
    const socket = await connect('Player');
    const kicked = vi.fn();
    socket.on('kicked', kicked);
    socket.emit('kick', invalid as string);
    const barrier = once(socket, 'joined');
    socket.emit('join', 'Player');
    await barrier;
    expect(kicked).not.toHaveBeenCalled();
  });

  it('onSpeaker / offSpeaker の一覧を全員に送る', async () => {
    const first = await connect('First');
    const second = await connect('Second');
    for (const [event, expected] of [['onSpeaker', ['First']], ['offSpeaker', []]] as const) {
      const received = [once(first, 'setAdminSpeaker'), once(second, 'setAdminSpeaker')];
      first.emit(event);
      expect(await Promise.all(received)).toEqual([expected, expected]);
    }
  });

  it('changeSetting を全員に送る', async () => {
    const first = await connect('First');
    const second = await connect('Second');
    const received = [once(first, 'changeSetting'), once(second, 'changeSetting')];
    first.emit('changeSetting');
    await Promise.all(received);
  });

  it('kick を対象だけに送る', async () => {
    const first = await connect('First');
    const second = await connect('Second');
    const wronglyKicked = vi.fn();
    first.on('kicked', wronglyKicked);
    const kicked = once(second, 'kicked');
    first.emit('kick', 'Second');
    await kicked;
    expect(wronglyKicked).not.toHaveBeenCalled();
  });

  it.each(['exit', 'disconnect'] as const)('%s で全体発言者から外す', async (event) => {
    const first = await connect('First');
    const second = await connect('Second');
    const enabled = once(second, 'setAdminSpeaker');
    first.emit('onSpeaker');
    await enabled;
    const disabled = once(second, 'setAdminSpeaker');
    if (event === 'exit') first.emit('exit');
    else first.disconnect();
    expect(await disabled).toEqual([]);
  });

  it('切断時に配信タイマーを止める', async () => {
    const socket = await connect('Player');
    await once(socket, 'playerData');
    const peer = server.io.sockets.sockets.get(socket.id!);
    if (!peer) throw new Error('ソケット取得失敗');
    const closed = new Promise<void>((resolve) => peer.once('disconnect', () => resolve()));
    socket.disconnect();
    await closed;
    getData.mockClear();
    await new Promise((resolve) => setTimeout(resolve, 220));
    expect(getData).not.toHaveBeenCalled();
  });

  it('debug を指定フォルダーの日付別 JSONL に追記する', async () => {
    const socket = await connect('Player');
    for (const data of [{ message: 'first' }, { message: 'second' }]) {
      socket.emit('debug', data);
      const barrier = once(socket, 'joined');
      socket.emit('join', 'Player');
      await barrier;
    }
    expect(readFileSync(path.join(logsDirectory, 'logs', '2026-11-03.jsonl'), 'utf8')).toBe('{"message":"first"}\n{"message":"second"}\n');
  });
});
