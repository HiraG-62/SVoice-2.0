import { EventEmitter } from 'node:events';
import type { Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@svoice/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSocketSession, JOIN_TIMEOUT_MS } from '../utils/socketSession';

function setup() {
  const incoming = new EventEmitter();
  const outgoing = vi.fn();
  const fake = {
    connected: false,
    on: incoming.on.bind(incoming), off: incoming.off.bind(incoming), emit: outgoing,
    connect: vi.fn(() => { fake.connected = true; incoming.emit('connect'); }),
    disconnect: vi.fn(() => { fake.connected = false; }),
  };
  const callbacks = { joined: vi.fn(), playerData: vi.fn(), changeSetting: vi.fn(), setAdminSpeaker: vi.fn(), kicked: vi.fn(), failed: vi.fn() };
  const session = createSocketSession(fake as unknown as Socket<ServerToClientEvents, ClientToServerEvents>, callbacks);
  return { session, fake, incoming, outgoing, callbacks };
}

afterEach(() => { vi.useRealTimers(); });

describe('Socket の参加と後始末', () => {
  it('リスナーを先に登録し、退出と再参加で重複しない', async () => {
    const { session, incoming, outgoing, callbacks } = setup();
    for (let i = 0; i < 3; i++) {
      const joined = session.join('Alice');
      expect(outgoing).toHaveBeenLastCalledWith('join', 'Alice');
      for (const name of ['joined', 'playerData', 'changeSetting', 'setAdminSpeaker', 'kicked']) expect(incoming.listenerCount(name)).toBe(1);
      incoming.emit('joined', ['Bob']);
      await joined;
      incoming.emit('playerData', []);
      session.leave();
      expect(incoming.eventNames()).toEqual([]);
    }
    expect(callbacks.playerData).toHaveBeenCalledTimes(3);
  });
  it('キック時にもすべて解除する', async () => {
    const { session, incoming, callbacks, fake } = setup();
    const joined = session.join('Alice');
    incoming.emit('joined', []);
    await joined;
    incoming.emit('kicked');
    expect(callbacks.kicked).toHaveBeenCalledOnce();
    expect(incoming.eventNames()).toEqual([]);
    expect(fake.connected).toBe(false);
  });
  it('参加応答が 10 秒なければ失敗する', async () => {
    vi.useFakeTimers();
    const { session, incoming } = setup();
    const rejected = expect(session.join('Alice')).rejects.toThrow('接続できませんでした');
    await vi.advanceTimersByTimeAsync(JOIN_TIMEOUT_MS);
    await rejected;
    expect(incoming.eventNames()).toEqual([]);
  });
  it('接続拒否を失敗として返す', async () => {
    const { session, incoming } = setup();
    const rejected = expect(session.join('Alice')).rejects.toThrow('接続できませんでした');
    incoming.emit('connect_error', new Error('unauthorized'));
    await rejected;
    expect(incoming.eventNames()).toEqual([]);
  });
  it('再接続で参加を再送する', async () => {
    const { session, incoming, outgoing } = setup();
    const joined = session.join('Alice');
    incoming.emit('joined', []);
    await joined;
    incoming.emit('connect');
    expect(outgoing.mock.calls.filter(([name]) => name === 'join')).toHaveLength(2);
    session.leave();
  });
  it('参加後の再接続拒否も通知しリスナーを解除する', async () => {
    const { session, incoming, callbacks } = setup();
    const joined = session.join('Alice');
    incoming.emit('joined', []);
    await joined;
    incoming.emit('connect_error', new Error('expired'));
    expect(callbacks.failed).toHaveBeenCalledOnce();
    expect(incoming.eventNames()).toEqual([]);
  });
});
