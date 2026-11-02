import { NoiseSuppressorWorklet_Name } from '@timephy/rnnoise-wasm';
import NoiseSuppressorWorklet from '@timephy/rnnoise-wasm/NoiseSuppressorWorklet?worker&url';
import { watch, effectScope } from 'vue';
import { useAudioStore } from '../stores/audio';
import { useCallStore } from '../stores/call';
import { useSettingsStore } from '../stores/settings';
import { createMicService } from '../services/mic';
import { createVoiceRoom, type RoomCredentials } from '../services/voiceRoom';
import { createDiagnostics, errorCode } from '../services/diagnostics';
import type { createSocketSession } from '../utils/socketSession';
import { SocketJoinError } from '../utils/socketSession';
import { version } from '../package.json';

type VoiceSocket = ReturnType<typeof createSocketSession>;

export function createVoiceSession(socket: VoiceSocket) {
  const audio = useAudioStore(), call = useCallStore(), settings = useSettingsStore();
  const mic = createMicService(NoiseSuppressorWorklet, NoiseSuppressorWorklet_Name);
  const diagnostics = createDiagnostics();
  const restoreConsole = diagnostics.captureConsole();
  let room: Awaited<ReturnType<typeof createVoiceRoom>> | undefined;
  let epoch = 0;
  let lastMute = 0;
  let hasPhone = 0;
  let stopping: Promise<void> | undefined;
  const scope = effectScope(true);
  const warning = (message: string) => diagnostics.record('warn', message);

  function updateMic() {
    mic.update({ level: audio.micLevel, muted: audio.muted, noiseSuppression: audio.noiseSuppression });
    audio.setReady(mic.ready, mic.context?.state ?? 'closed');
  }

  async function prepareMic() {
    updateMic();
    await mic.prepare();
    audio.setDevices(await navigator.mediaDevices.enumerateDevices(), mic.media?.getAudioTracks()[0]?.getSettings().deviceId);
    updateMic();
  }

  function mute(status: number) {
    const muted = status === 1 ? !audio.muted : status === 2 ? true : status === 3 ? false : audio.muted;
    if (muted === audio.muted) return;
    audio.setMuted(muted);
    updateMic();
    void new Audio(muted ? '/sounds/mute.mp3' : '/sounds/unmute.mp3').play().catch(() => warning('効果音の再生失敗'));
  }

  function sync() {
    if (call.status === 'idle') return;
    const self = call.players.find(p => p.name === call.gamerTag);
    if (self) {
      if (hasPhone !== self.hasTelephone) {
        void $fetch(self.hasTelephone ? '/api/setPhoneRole' : '/api/removePhoneRole').catch(() => warning('スマホロールの更新失敗'));
      }
      hasPhone = self.hasTelephone;
      if (self.mute !== 0 && self.mute !== lastMute) mute(self.mute);
      lastMute = self.mute;
    }
    if (!settings.value) void settings.load().catch(() => warning('距離設定の読み込み失敗'));
    room?.sync();
  }

  scope.run(() => {
    watch(() => [audio.micLevel, audio.muted, audio.noiseSuppression], updateMic, { flush: 'sync' });
    watch(() => audio.selectedInput?.deviceId, (device, previous) => {
      if (!device || !previous || device === previous || !mic.ready) return;
      void mic.changeInput(device).then(updateMic).catch(() => warning('入力デバイスの変更失敗'));
    });
    watch(() => [call.players, call.speakers, settings.value, audio.phoneLevel, call.users], sync, { deep: true, flush: 'sync' });
  });

  async function leave() {
    epoch++;
    socket.leave();
    const previous = room;
    room = undefined;
    call.reset();
    lastMute = 0; hasPhone = 0;
    const prior = stopping;
    stopping = (async () => {
      await prior;
      try { await previous?.dispose(); } catch { warning('ルームの終了失敗'); }
      try { await mic.dispose(); } catch { warning('マイクの終了失敗'); }
      audio.setReady(false, 'closed');
    })();
    await stopping;
  }

  async function join() {
    if (call.status !== 'idle') return;
    await stopping;
    if (call.status !== 'idle') return;
    const current = ++epoch;
    call.setStatus('joining'); call.setError('');
    let failure = 'マイクを利用不可';
    try {
      await prepareMic();
      if (current !== epoch) return;
      failure = '音声トークンの取得失敗';
      const credentials: RoomCredentials = await $fetch('/api/skywayToken');
      if (current !== epoch) return;
      failure = '音声ルームへの参加失敗';
      const connected = await createVoiceRoom(credentials, {
        context: mic.context!, destination: mic.destination!,
        state: () => ({ gamerTag: call.gamerTag, players: call.players, speakers: call.speakers,
          settings: settings.value, phoneLevel: audio.phoneLevel,
          userGain: tag => call.users.find(u => u.gamerTag === tag)?.gain ?? 1 }),
        addUser: tag => { if (current === epoch) call.addUser(tag); },
        removeUser: tag => { if (current === epoch) call.removeUser(tag); },
        nearby: (tag, voice, gain) => { if (current === epoch) call.setNearby(tag, voice, gain); },
        removeNearby: tag => { if (current === epoch) call.removeNearby(tag); }, warning,
      });
      if (current !== epoch) { await connected.dispose(); return; }
      room = connected;
      failure = 'Socket の接続失敗';
      await socket.join(call.gamerTag);
      if (current !== epoch) return;
      call.setStatus('joined');
      sync();
    } catch (error) {
      if (current !== epoch) return;
      if (error instanceof SocketJoinError && error.reason === 'timeout') failure = 'Socket の接続タイムアウト';
      diagnostics.record('error', `${failure}: ${errorCode(error)}`);
      await leave();
      call.setError(failure);
    }
  }

  function debugSnapshot() {
    return {
      self: { status: call.status, inGame: call.inGame, muted: audio.muted, noiseSuppression: audio.noiseSuppression,
        micLevel: audio.micLevel, phoneLevel: audio.phoneLevel, micReady: mic.ready,
        audioContext: mic.context?.state ?? 'closed', micGain: mic.currentGain },
      peers: room?.snapshot() ?? [], resources: room?.resources() ?? { receivers: 0, subscriptions: 0, syncTimers: 0, audioGraphs: 0 },
      entries: diagnostics.snapshot(), userAgent: navigator.userAgent, version,
      socket: socket.resources(),
    };
  }

  const unhandled = () => diagnostics.record('error', '未処理のブラウザエラー');
  window.addEventListener('error', unhandled);
  window.addEventListener('unhandledrejection', unhandled);
  const pagehide = () => { void leave(); };
  window.addEventListener('pagehide', pagehide);
  return {
    join, leave, mute, sync, prepareMic, mic, debugSnapshot,
    initialize: async () => { audio.hydrate(); await prepareMic(); await settings.load(); },
    sendDebug: () => socket.debug(debugSnapshot()),
    dispose: async () => {
      scope.stop();
      restoreConsole();
      window.removeEventListener('error', unhandled); window.removeEventListener('unhandledrejection', unhandled);
      window.removeEventListener('pagehide', pagehide);
      await leave();
    },
  };
}

export function useVoice() { return useNuxtApp().$voice; }
