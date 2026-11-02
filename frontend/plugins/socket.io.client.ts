import { io, Socket } from 'socket.io-client'
import type { ClientToServerEvents, ServerToClientEvents } from '@svoice/shared';
import { defineNuxtPlugin } from '#app'
import { createSocketSession } from '../utils/socketSession';
import { useCusEvent } from '../composables/useCusEvent';

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(config.public.server.socket.url, {
    autoConnect: false,
    auth: async (callback) => {
      try {
        const { token } = await $fetch('/api/socketToken');
        callback({ token });
      } catch {
        callback({ token: '' });
      }
    },
    secure: true,
    transports: ['websocket', 'polling']
  })

  const { emit } = useCusEvent();
  const state = useComponents();
  const connectionError = useState<string>('connectionError', () => '');
  const exit = () => {
    emit('exit', 'exit');
    state.isSpeaking.value = false;
    state.isJoining.value = false;
    state.isJoiningIngame.value = false;
    state.playerData.value = [];
    state.adminSpeaker.value = new Set();
  };
  const voiceSocket = createSocketSession(socket, {
    joined: data => { state.adminSpeaker.value = new Set(data); },
    playerData: data => { state.playerData.value = data; emit('dataCycle', 'change'); },
    changeSetting: () => { void getIngameSettings(); },
    setAdminSpeaker: data => { state.adminSpeaker.value = new Set(data); emit('dataCycle', 'change'); },
    kicked: exit,
    failed: () => { exit(); connectionError.value = '接続できませんでした'; },
  });
  return { provide: { voiceSocket } }
})
