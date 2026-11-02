import { io, Socket } from 'socket.io-client'
import type { ClientToServerEvents, ServerToClientEvents } from '@svoice/shared';
import { defineNuxtPlugin } from '#app'
import { createSocketSession } from '../utils/socketSession';
import { createVoiceSession } from '../composables/useVoice';
import { useCallStore } from '../stores/call';
import { useSettingsStore } from '../stores/settings';

export default defineNuxtPlugin({ name: 'voice', dependsOn: ['pinia'], setup(nuxtApp) {
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

  const call = useCallStore();
  const settings = useSettingsStore();
  const voiceSocket = createSocketSession(socket, {
    joined: data => call.setSpeakers(data),
    playerData: data => call.setPlayers(data),
    changeSetting: () => { void settings.load().catch(() => call.setError('距離設定の読み込み失敗')); },
    setAdminSpeaker: data => call.setSpeakers(data),
    kicked: () => { void voice.leave(); },
    failed: reason => { void voice.leave(); call.setError(reason === 'timeout' ? 'Socket の接続タイムアウト' : 'Socket の接続失敗'); },
  });
  const voice = createVoiceSession(voiceSocket);
  nuxtApp.vueApp.onUnmount(() => { void voice.dispose(); });
  if (import.meta.hot) import.meta.hot.dispose(() => { void voice.dispose(); });
  return { provide: { voiceSocket, voice } }
} })
