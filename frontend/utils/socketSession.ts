import type { Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@svoice/shared';

export const JOIN_TIMEOUT_MS = 10_000;
type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type Callbacks = ServerToClientEvents & { failed: () => void };

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
      let timeout: ReturnType<typeof setTimeout>;
      const failed = () => {
        const wasPending = pending;
        leave();
        if (!wasPending) callbacks.failed();
      };
      const armTimeout = () => {
        clearTimeout(timeout);
        timeout = setTimeout(failed, JOIN_TIMEOUT_MS);
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
      socket.on('connect_error', failed);
      socket.on('joined', joined);
      socket.on('playerData', callbacks.playerData);
      socket.on('changeSetting', callbacks.changeSetting);
      socket.on('setAdminSpeaker', callbacks.setAdminSpeaker);
      socket.on('kicked', kicked);
      cleanup = () => {
        clearTimeout(timeout);
        socket.off('connect', connected);
        socket.off('connect_error', failed);
        socket.off('joined', joined);
        socket.off('playerData', callbacks.playerData);
        socket.off('changeSetting', callbacks.changeSetting);
        socket.off('setAdminSpeaker', callbacks.setAdminSpeaker);
        socket.off('kicked', kicked);
        if (pending) { pending = false; reject(new Error('接続できませんでした')); }
      };
      armTimeout();
      socket.connect();
    });
  }
  return {
    join, leave,
    changeSetting: () => socket.emit('changeSetting', 'change'),
    onSpeaker: () => socket.emit('onSpeaker'),
    offSpeaker: () => socket.emit('offSpeaker'),
    kick: (gamerTag: string) => socket.emit('kick', gamerTag),
    debug: (data: unknown) => socket.emit('debug', data),
  };
}
