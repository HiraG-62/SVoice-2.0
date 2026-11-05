import { existsSync, mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync, mkdirSync, utimesSync, truncateSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@svoice/shared';
import { createSocketToken } from '@svoice/shared/socket-token';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSocketServer, startSocket } from '../src/socketServer';
import { config, player } from './fixtures';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
const LISTEN_TIMEOUT_MS = 1000;
const clients: ClientSocket[] = [];
let server: ReturnType<typeof createSocketServer>;
let url: string;
let logsDirectory: string;
let getData: ReturnType<typeof vi.fn<() => typeof player[] | null>>;
let clock: Date;
let log: ReturnType<typeof vi.fn<(message: string) => void>>;

function once<T>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event as 'joined', resolve as (data: (string | null)[]) => void));
}

async function connect(name: string, admin = true, join = true): Promise<ClientSocket> {
  const token = createSocketToken({ gamerTag: name, discordId: '123456789012345678', admin, exp: clock.getTime() + 60_000 }, config.API_SECRET);
  const socket: ClientSocket = io(url, { transports: ['websocket'], forceNew: true, auth: { token } });
  clients.push(socket);
  await once(socket, 'connect');
  if (!join) return socket;
  const joined = once(socket, 'joined');
  socket.emit('join', name);
  await joined;
  return socket;
}

beforeEach(async () => {
  logsDirectory = mkdtempSync(path.join(tmpdir(), 'svoice-socket-test-'));
  getData = vi.fn(() => [player]);
  clock = new Date(2026, 10, 3, 12);
  log = vi.fn();
  server = createSocketServer({ config: { ...config, DATA_DIR: logsDirectory }, getData, now: () => clock, logger: { log } });
  await startSocket(server, 0);
  const address = server.server.address();
  if (!address || typeof address === 'string') throw new Error('ポート取得失敗');
  url = `http://localhost:${address.port}`;
});

afterEach(async () => {
  vi.restoreAllMocks();
  clients.splice(0).forEach((client) => client.disconnect());
  await new Promise<void>((resolve) => server.io.close(() => resolve()));
  const directory = path.join(logsDirectory, 'logs');
  if (existsSync(directory)) {
    for (const file of readdirSync(directory)) unlinkSync(path.join(directory, file));
    rmdirSync(directory);
  }
  rmdirSync(logsDirectory);
});

describe('socketServer', () => {
  it('接続・参加・退出・切断を順に記録し、join と exit の重複では記録しない', async () => {
    const socket = await connect('Player');
    const id = socket.id!;
    const peer = server.io.sockets.sockets.get(id)!;
    const joined = once(socket, 'joined');
    socket.emit('join', 'Forged');
    await joined;
    const exited = new Promise<void>(resolve => peer.once('exit', () => resolve()));
    socket.emit('exit');
    await exited;
    const exitedAgain = new Promise<void>(resolve => peer.once('exit', () => resolve()));
    socket.emit('exit');
    await exitedAgain;
    const disconnected = new Promise<void>(resolve => peer.once('disconnect', () => resolve()));
    socket.disconnect();
    await disconnected;
    expect(log.mock.calls).toEqual([
      [`接続: Player ${id}`],
      ['参加: Player（参加中 1 人）'],
      ['退出: Player（退出操作、参加中 0 人）'],
      [`切断: Player ${id} client namespace disconnect`],
    ]);
  });

  it('未参加の切断では退出を記録しない', async () => {
    const socket = await connect('Player', false, false);
    const id = socket.id!;
    const peer = server.io.sockets.sockets.get(id)!;
    const disconnected = new Promise<void>(resolve => peer.once('disconnect', () => resolve()));
    socket.disconnect();
    await disconnected;
    expect(log.mock.calls).toEqual([
      [`接続: Player ${id}`], [`切断: Player ${id} client namespace disconnect`],
    ]);
  });

  it('再参加と参加中の切断を記録し、接続数と切断理由を反映する', async () => {
    const first = await connect('Player');
    const second = await connect('Player');
    const peer = server.io.sockets.sockets.get(first.id!)!;
    log.mockClear();
    first.emit('exit');
    const joined = once(first, 'joined');
    first.emit('join', 'Player');
    await joined;
    const disconnected = new Promise<void>(resolve => peer.once('disconnect', () => resolve()));
    const id = first.id!;
    peer.conn.close();
    await disconnected;
    expect(log.mock.calls).toEqual([
      ['退出: Player（退出操作、参加中 1 人）'],
      ['参加: Player（参加中 2 人）'],
      ['退出: Player（forced close、参加中 1 人）'],
      [`切断: Player ${id} forced close`],
    ]);
    expect(second.connected).toBe(true);
  });

  it('全体発言は状態が変わったときだけ記録し、退出時の終了も記録する', async () => {
    const socket = await connect('Speaker');
    log.mockClear();
    for (const event of ['onSpeaker', 'onSpeaker', 'offSpeaker', 'offSpeaker', 'onSpeaker'] as const) {
      socket.emit(event);
      const joined = once(socket, 'joined');
      socket.emit('join', 'Speaker');
      await joined;
    }
    const peer = server.io.sockets.sockets.get(socket.id!)!;
    const exited = new Promise<void>(resolve => peer.once('exit', () => resolve()));
    socket.emit('exit');
    await exited;
    expect(log.mock.calls).toEqual([
      ['全体発言開始: Speaker'], ['全体発言終了: Speaker'],
      ['全体発言開始: Speaker'], ['全体発言終了: Speaker'],
      ['退出: Speaker（退出操作、参加中 0 人）'],
    ]);
  });

  it('ログ出力の失敗で参加・全体発言・通知・退出を止めない', async () => {
    log.mockImplementation(() => { throw new Error('出力不可'); });
    const socket = await connect('Player');
    const enabled = once(socket, 'setAdminSpeaker');
    socket.emit('onSpeaker');
    expect(await enabled).toEqual(['Player']);
    const changed = once(socket, 'changeSetting');
    socket.emit('changeSetting');
    await changed;
    const peer = server.io.sockets.sockets.get(socket.id!)!;
    const exited = new Promise<void>(resolve => peer.once('exit', () => resolve()));
    socket.emit('exit');
    await exited;
    expect(peer.rooms.has('joined')).toBe(false);
  });

  it('ゲーマータグの制御文字を空白に置き換え、ログを 1 行にする', async () => {
    const socket = await connect('Alice\r\nBob\u2028');
    expect(log.mock.calls).toEqual([
      [`接続: Alice  Bob  ${socket.id}`], ['参加: Alice  Bob （参加中 1 人）'],
    ]);
  });

  it('listen 直後に close されたら reject する', async () => {
    const pending = createSocketServer({ config, getData: () => [] });
    const ready = startSocket(pending, 0);
    const rejected = expect(ready).rejects.toThrow('listen 前に停止');
    pending.server.close();
    try { await rejected; }
    finally { await new Promise<void>(resolve => pending.io.close(() => resolve())); }
  }, LISTEN_TIMEOUT_MS);

  it('listen 成功後は待機用リスナーを外し、close しても成功のまま', async () => {
    const pending = createSocketServer({ config, getData: () => [] });
    const listeners = { error: pending.server.listeners('error'), close: pending.server.listeners('close'),
      listening: pending.server.listeners('listening') };
    const ready = startSocket(pending, 0);
    try {
      await ready;
      for (const event of ['error', 'close', 'listening'] as const) {
        expect(pending.server.listeners(event)).toEqual(listeners[event]);
      }
    } finally { await new Promise<void>(resolve => pending.io.close(() => resolve())); }
    await expect(ready).resolves.toBeUndefined();
  });

  it('debug の保存成功と制限超過を ack で返す', async () => {
    const socket = await connect('Player', false);
    const debug = (data: unknown) => new Promise<{ ok: boolean }>(resolve => socket.emit('debug', data, resolve));
    expect(await debug('あ'.repeat(30_000))).toEqual({ ok: false });
    for (let i = 0; i < 5; i++) expect(await debug({ i })).toEqual({ ok: true });
    expect(await debug({ rejected: true })).toEqual({ ok: false });
    expect(log.mock.calls.filter(([message]) => message.startsWith('debug 保存:'))).toHaveLength(5);
    expect(log.mock.calls.filter(([message]) => message.startsWith('debug 制限超過:'))).toEqual([
      [`debug 制限超過: Player ${socket.id}`], [`debug 制限超過: Player ${socket.id}`],
    ]);
    expect(readFileSync(path.join(logsDirectory, 'logs', '2026-11-03.jsonl'), 'utf8').trim().split('\n')).toHaveLength(5);
  });
  it('debug の書き込み失敗を ack で返す', async () => {
    const socket = await connect('Player', false);
    vi.spyOn(fs, 'appendFileSync').mockImplementation(() => { throw new Error('保存不可'); });
    const result = await new Promise(resolve => socket.emit('debug', {}, resolve));
    expect(result).toEqual({ ok: false });
    expect(log).not.toHaveBeenCalledWith('debug 保存: Player');
  });
  it('ログ整理が失敗しても保存済みの debug は成功を返す', async () => {
    const socket = await connect('Player', false);
    vi.spyOn(fs, 'readdirSync').mockImplementation(() => { throw new Error('整理不可'); });
    const result = await new Promise(resolve => socket.emit('debug', {}, resolve));
    expect(result).toEqual({ ok: true });
    expect(readFileSync(path.join(logsDirectory, 'logs', '2026-11-03.jsonl'), 'utf8')).toContain('Player');
  });
  it.each([undefined, 'invalid', createSocketToken({ gamerTag: 'Player', discordId: '123456789012345678', admin: true, exp: 1 }, config.API_SECRET)])('トークンなし・不正・期限切れを接続拒否する', async (token) => {
    const socket: ClientSocket = io(url, { transports: ['websocket'], forceNew: true, reconnection: false, auth: { token } });
    clients.push(socket);
    const error = await once<Error>(socket, 'connect_error');
    expect(error.message).toBe('unauthorized');
    expect(server.io.sockets.sockets.size).toBe(0);
  });

  it('一般ユーザーの管理者操作を無視する', async () => {
    const first = await connect('First', false);
    const second = await connect('Second', false);
    const denied = vi.fn();
    second.on('kicked', denied).on('setAdminSpeaker', denied).on('changeSetting', denied);
    first.emit('onSpeaker');
    first.emit('offSpeaker');
    first.emit('changeSetting');
    first.emit('kick', 'Second');
    const barrier = once(first, 'joined');
    first.emit('join', 'Other');
    expect(await barrier).toEqual([]);
    await once(second, 'playerData');
    expect(denied).not.toHaveBeenCalled();
    for (const event of ['onSpeaker', 'offSpeaker', 'changeSetting', 'kick']) {
      expect(log).toHaveBeenCalledWith(`操作拒否: ${event} First ${first.id}`);
    }
  });

  it('join 前と exit 後は配信もキックの対象にもしない', async () => {
    const admin = await connect('Admin');
    const socket = await connect('Player', false, false);
    const received = vi.fn();
    socket.on('playerData', received).on('kicked', received);
    admin.emit('kick', 'Player');
    await new Promise((resolve) => setTimeout(resolve, 220));
    expect(received).not.toHaveBeenCalled();
    const joined = once(socket, 'joined');
    socket.emit('join', 'Forged');
    await joined;
    await once(socket, 'playerData');
    socket.emit('exit');
    const peer = server.io.sockets.sockets.get(socket.id!)!;
    await new Promise<void>((resolve) => peer.once('exit', () => resolve()));
    received.mockClear();
    admin.emit('kick', 'Player');
    await new Promise((resolve) => setTimeout(resolve, 220));
    expect(received).not.toHaveBeenCalled();
  });

  it('null のデータを空配列として配信する', async () => {
    const socket = await connect('Player');
    getData.mockReturnValue(null);
    expect(await once(socket, 'playerData')).toEqual([]);
  });

  it('同じタグの全接続に kick を送る', async () => {
    const admin = await connect('Admin');
    const first = await connect('Player', false);
    const second = await connect('Player', false);
    const received = [once(first, 'kicked'), once(second, 'kicked')];
    admin.emit('kick', 'Player');
    await Promise.all(received);
    expect(log).toHaveBeenCalledWith('キック: Admin → Player（2 接続）');
  });

  it('発言中に権限が外れても offSpeaker を受け付ける', async () => {
    const socket = await connect('Player');
    const enabled = once(socket, 'setAdminSpeaker');
    socket.emit('onSpeaker');
    await enabled;
    server.io.sockets.sockets.get(socket.id!)!.data.admin = false;
    const disabled = once(socket, 'setAdminSpeaker');
    socket.emit('offSpeaker');
    expect(await disabled).toEqual([]);
  });

  it('同じタグの片方の退出で他方の全体発言を止めない', async () => {
    const first = await connect('Player');
    const second = await connect('Player');
    const enabled = once(second, 'setAdminSpeaker');
    second.emit('onSpeaker');
    await enabled;
    first.emit('exit');
    const joined = once(first, 'joined');
    first.emit('join', 'Forged');
    expect(await joined).toEqual(['Player']);
  });

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
    expect(log).toHaveBeenCalledWith('設定変更の通知: First');
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

  it('参加者がいなければデータを取得しない', async () => {
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
    const lines = readFileSync(path.join(logsDirectory, 'logs', '2026-11-03.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    expect(lines).toEqual(['first', 'second'].map((message) => ({ receivedAt: clock.toISOString(), gamerTag: 'Player', data: { message } })));
  });

  it('debug は一般ユーザーも利用でき、64KB 超と 1 分 5 回超を捨てる', async () => {
    const socket = await connect('Player', false);
    socket.emit('debug', 'あ'.repeat(30_000));
    for (let i = 0; i < 6; i++) socket.emit('debug', { i });
    const barrier = once(socket, 'joined');
    socket.emit('join', 'Player');
    await barrier;
    const file = path.join(logsDirectory, 'logs', '2026-11-03.jsonl');
    expect(readFileSync(file, 'utf8').trim().split('\n')).toHaveLength(5);
    clock = new Date(clock.getTime() + 60_000);
    socket.emit('debug', { next: true });
    const next = once(socket, 'joined');
    socket.emit('join', 'Player');
    await next;
    expect(readFileSync(file, 'utf8').trim().split('\n')).toHaveLength(6);
  });

  it('古いログと 100MB 超のログを古い順に削除する', async () => {
    const directory = path.join(logsDirectory, 'logs');
    mkdirSync(directory);
    const expired = path.join(directory, '2026-09-01.jsonl');
    const oversized = path.join(directory, '2026-11-01.jsonl');
    const other = path.join(directory, 'preserve.txt');
    for (const file of [expired, oversized, other]) writeFileSync(file, '');
    utimesSync(expired, new Date(2026, 8, 1), new Date(2026, 8, 1));
    utimesSync(oversized, new Date(2026, 10, 1), new Date(2026, 10, 1));
    truncateSync(oversized, 100 * 1024 * 1024 + 1);
    const socket = await connect('Player');
    socket.emit('debug', {});
    const barrier = once(socket, 'joined');
    socket.emit('join', 'Player');
    await barrier;
    expect(existsSync(expired)).toBe(false);
    expect(existsSync(oversized)).toBe(false);
    expect(existsSync(other)).toBe(true);
  });
});
