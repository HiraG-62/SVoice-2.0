import type { Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@svoice/shared';

export const JOIN_TIMEOUT_MS = 10_000;
export const DEBUG_ACK_TIMEOUT_MS = 5_000;
type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type SocketFailure = 'connection' | 'timeout';
export class SocketJoinError extends Error {
  constructor(readonly reason: SocketFailure) { super('接続できませんでした'); }
}
type Callbacks = ServerToClientEvents & { failed: (reason?: SocketFailure) => void };

export function createSocketSession(socket: AppSocket, callbacks: Callbacks) {
  let cleanup: (() => void) | undefined;
  function leave() {
    if (socket.connected) socket.emit('exit');
    cleanup?.();
    cleanup = undefined;
    socket.disconnect();
  }
  function join(gamerTag: string): Promise<void> {
    leave();
    return new Promise((resolve, reject) => {
      let pending = true;
      let rejection: Error = new Error('接続できませんでした');
      let timeout: ReturnType<typeof setTimeout>;
      const failed = (reason: SocketFailure) => {
        const wasPending = pending;
        rejection = new SocketJoinError(reason);
        leave();
        if (!wasPending) callbacks.failed(reason);
      };
      const connectionFailed = () => failed('connection');
      const armTimeout = () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => failed('timeout'), JOIN_TIMEOUT_MS);
      };
      const connected = () => { armTimeout(); socket.emit('join', gamerTag); };
      const joined: ServerToClientEvents['joined'] = data => {
        clearTimeout(timeout);
        callbacks.joined(data);
        pending = false;
        resolve();
      };
      const kicked = () => { leave(); callbacks.kicked(); };
      socket.on('connect', connected);
      socket.on('connect_error', connectionFailed);
      socket.on('joined', joined);
      socket.on('playerData', callbacks.playerData);
      socket.on('changeSetting', callbacks.changeSetting);
      socket.on('setAdminSpeaker', callbacks.setAdminSpeaker);
      socket.on('kicked', kicked);
      cleanup = () => {
        clearTimeout(timeout);
        socket.off('connect', connected);
        socket.off('connect_error', connectionFailed);
        socket.off('joined', joined);
        socket.off('playerData', callbacks.playerData);
        socket.off('changeSetting', callbacks.changeSetting);
        socket.off('setAdminSpeaker', callbacks.setAdminSpeaker);
        socket.off('kicked', kicked);
        if (pending) { pending = false; reject(rejection); }
      };
      armTimeout();
      socket.connect();
    });
  }
  return {
    join, leave,
    resources: () => ({ connected: socket.connected, listeners: (['connect', 'connect_error', 'joined', 'playerData', 'changeSetting', 'setAdminSpeaker', 'kicked'] as const)
      .reduce((count, event) => count + socket.listeners(event).length, 0) }),
    changeSetting: () => socket.emit('changeSetting', 'change'),
    onSpeaker: () => socket.emit('onSpeaker'),
    offSpeaker: () => socket.emit('offSpeaker'),
    kick: (gamerTag: string) => socket.emit('kick', gamerTag),
    debug: (data: unknown): Promise<boolean> => {
      if (!socket.connected) return Promise.resolve(false);
      return new Promise(resolve => {
        const timeout = setTimeout(() => resolve(false), DEBUG_ACK_TIMEOUT_MS);
        socket.emit('debug', data, result => {
          clearTimeout(timeout);
          resolve(result.ok === true);
        });
      });
    },
  };
}
