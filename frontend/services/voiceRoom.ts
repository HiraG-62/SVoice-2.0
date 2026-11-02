import type { IngameSettings, PlayerData } from '@svoice/shared';
import { decodeMemberName } from '@svoice/shared';
import type { RoomPublication } from '@skyway-sdk/room';
import { calcPlayerVolume, getDistance, shouldSubscribe } from './volume';
import { createSubscriptionController } from './subscription';
import { errorCode } from './diagnostics';
import { ANALYSER_FFT_SIZE, MAX_SUBSCRIBERS, receiveGain, SYNC_INTERVAL_MS, VOICE_CENTER, VOICE_INTERVAL_MS, VOICE_THRESHOLD } from './constants';

interface VoiceState {
  gamerTag: string;
  players: PlayerData[];
  speakers: string[];
  settings: IngameSettings | null;
  phoneLevel: number;
  userGain(tag: string): number;
}
interface VoicePorts {
  context: AudioContext;
  destination: MediaStreamAudioDestinationNode;
  state(): VoiceState;
  addUser(tag: string): void;
  removeUser(tag: string): void;
  nearby(tag: string, voice: boolean, gain: number): void;
  removeNearby(tag: string): void;
  warning(message: string): void;
}
export interface RoomCredentials { token: string; roomName: string; memberName: string }

export async function createVoiceRoom(credentials: RoomCredentials, ports: VoicePorts) {
  const sdk = await import('@skyway-sdk/room');
  const context = await sdk.SkyWayContext.Create(credentials.token);
  const room = await sdk.SkyWayRoom.FindOrCreate(context, { type: 'sfu', name: credentials.roomName })
    .catch(async error => { await context.dispose(); throw error; });
  const disposeRoom = async () => {
    try { await room.dispose(); } finally { await context.dispose(); }
  };
  const me = await room.join({ name: credentials.memberName })
    .catch(async error => { await disposeRoom(); throw error; });
  const leaveRoom = async () => {
    try { await me.leave(); } finally { await disposeRoom(); }
  };
  const track = ports.destination.stream.getAudioTracks()[0];
  if (!track) {
    await leaveRoom();
    throw new Error('マイクを利用不可');
  }
  try { await me.publish(new sdk.LocalAudioStream(track), { maxSubscribers: MAX_SUBSCRIBERS }); }
  catch (error) { await leaveRoom(); throw error; }

  let disposed = false;
  type Receiver = ReturnType<typeof createReceiver>;
  const receivers = new Map<string, Receiver>();
  const revisions = new Map<string, number>();
  const pending = new Set<Promise<void>>();

  function createReceiver(tag: string, publication: RoomPublication) {
    let audioCleanup: (() => void) | undefined;
    let gainNode: GainNode | undefined;
    let voice = false;
    let distanceVolume = 0;
    let reason = 'ゲーム外';

    function updateGain() {
      if (!gainNode) return;
      const state = ports.state();
      gainNode.gain.value = receiveGain(state.userGain(tag), distanceVolume, state.phoneLevel);
      ports.nearby(tag, voice, gainNode.gain.value);
    }

    const controller = createSubscriptionController({
      exists: () => !disposed && room.publications.some(p => p.id === publication.id && p.state !== 'canceled'),
      active: id => me.subscriptions.some(s => s.id === id && s.state !== 'canceled'),
      subscribe: async () => {
        if (ports.context.state === 'suspended') await ports.context.resume();
        return (await me.subscribe(publication.id)).subscription.id;
      },
      unsubscribe: async id => {
        try { await me.unsubscribe(id); } catch { ports.warning('受信停止失敗'); }
      },
      attach: id => {
        const stream = me.subscriptions.find(s => s.id === id)?.stream;
        if (!(stream instanceof sdk.RemoteAudioStream)) throw new Error('音声ストリームなし');
        const input = new MediaStream([stream.track.clone()]);
        const source = ports.context.createMediaStreamSource(input);
        const gain = ports.context.createGain();
        const destination = ports.context.createMediaStreamDestination();
        const analyser = ports.context.createAnalyser();
        analyser.fftSize = ANALYSER_FFT_SIZE;
        const mutedAudio = new Audio();
        const audio = new Audio();
        let timer: ReturnType<typeof setInterval> | undefined;
        audioCleanup = () => {
          clearInterval(timer);
          for (const element of [mutedAudio, audio]) { element.pause(); element.srcObject = null; element.remove(); }
          for (const node of [source, gain, destination, analyser]) node.disconnect();
          for (const media of [input, destination.stream]) media.getTracks().forEach(t => t.stop());
        };
        // Chromium で受信トラックを WebAudio に流すため、ミュートした要素にも接続する。
        mutedAudio.autoplay = true; mutedAudio.muted = true; mutedAudio.srcObject = input;
        gainNode = gain;
        updateGain();
        source.connect(gain); gain.connect(destination); gain.connect(analyser);
        audio.autoplay = true; audio.srcObject = destination.stream;
        void audio.play().catch(() => ports.warning('音声再生失敗'));
        const samples = new Uint8Array(analyser.fftSize);
        timer = setInterval(() => {
          analyser.getByteTimeDomainData(samples);
          voice = samples.some(value => Math.abs(value - VOICE_CENTER) > VOICE_THRESHOLD);
          updateGain();
        }, VOICE_INTERVAL_MS);
      },
      cleanup: () => {
        audioCleanup?.(); audioCleanup = undefined; gainNode = undefined; voice = false;
        ports.removeNearby(tag);
      },
    });

    async function sync(volumes: Map<string, number>, inGame: boolean) {
      const state = ports.state();
      const speaker = state.speakers.includes(tag);
      distanceVolume = speaker ? 1 : inGame ? volumes.get(tag) ?? 0 : 0;
      reason = speaker ? '全体発言' : !inGame ? 'ゲーム外' : !state.settings ? '距離設定なし' : distanceVolume > 0 ? '距離音量あり' : '距離音量なし';
      updateGain();
      try { await controller.sync(shouldSubscribe(inGame, speaker, distanceVolume)); }
      catch (error) { ports.warning(`受信同期失敗: ${errorCode(error)}`); }
    }

    async function dispose() {
      const result = controller.dispose();
      ports.removeUser(tag);
      await result;
    }

    return { publication, sync, dispose, snapshot: () => {
      const subscription = me.subscriptions.find(s => s.id === controller.id);
      return { gamerTag: tag, receiving: !!gainNode, subscribing: controller.busy,
        subscriptionState: subscription?.state ?? null, connectionState: subscription?.getConnectionState() ?? null,
        distanceVolume, reason, gain: gainNode?.gain.value ?? 0, voice };
    } };
  }

  function sync() {
    if (disposed) return;
    const state = ports.state();
    const self = state.players.find(p => p.name === state.gamerTag);
    const volumes = self && state.settings
      ? calcPlayerVolume(self, getDistance(self, state.players), state.players, state.settings) : new Map<string, number>();
    for (const receiver of receivers.values()) void receiver.sync(volumes, !!self);
  }

  async function addPublication(publication: RoomPublication) {
    if (disposed || publication.publisher.id === me.id || publication.contentType !== 'audio' || !publication.publisher.name) return;
    const tag = decodeMemberName(publication.publisher.name);
    const revision = (revisions.get(tag) ?? 0) + 1;
    revisions.set(tag, revision);
    const previous = receivers.get(tag);
    receivers.delete(tag);
    await previous?.dispose();
    if (disposed || revisions.get(tag) !== revision || !room.publications.some(p => p.id === publication.id && p.state !== 'canceled')) return;
    ports.addUser(tag);
    receivers.set(tag, createReceiver(tag, publication));
    sync();
  }

  function enqueue(publication: RoomPublication) {
    const operation = addPublication(publication).catch(() => ports.warning('配信の登録失敗'));
    pending.add(operation);
    void operation.finally(() => pending.delete(operation));
  }

  function removePublication(publication: RoomPublication) {
    const tag = publication.publisher.name && decodeMemberName(publication.publisher.name);
    if (!tag) return;
    const receiver = receivers.get(tag);
    if (receiver?.publication.id !== publication.id) return;
    revisions.set(tag, (revisions.get(tag) ?? 0) + 1);
    receivers.delete(tag);
    void receiver.dispose();
  }

  room.onStreamPublished.add(event => enqueue(event.publication));
  room.onStreamUnpublished.add(event => removePublication(event.publication));
  room.onMemberLeft.add(event => {
    for (const receiver of receivers.values()) {
      if (receiver.publication.publisher.id === event.member.id) removePublication(receiver.publication);
    }
  });
  room.publications.forEach(enqueue);
  const timer = setInterval(sync, SYNC_INTERVAL_MS);

  async function dispose() {
    if (disposed) return;
    disposed = true;
    clearInterval(timer);
    room.onStreamPublished.removeAllListeners();
    room.onStreamUnpublished.removeAllListeners();
    room.onMemberLeft.removeAllListeners();
    await Promise.all([...receivers.values()].map(receiver => receiver.dispose()));
    receivers.clear();
    await Promise.all(pending);
    await leaveRoom();
  }

  return { sync, dispose, snapshot: () => [...receivers.values()].map(receiver => receiver.snapshot()),
    resources: () => ({ receivers: receivers.size, subscriptions: me.subscriptions.filter(s => s.state !== 'canceled').length,
      syncTimers: disposed ? 0 : 1, audioGraphs: [...receivers.values()].filter(r => r.snapshot().receiving).length }),
  };
}
