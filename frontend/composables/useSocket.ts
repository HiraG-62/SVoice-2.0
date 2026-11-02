import type { Socket } from 'socket.io-client'
import type { ClientToServerEvents, ServerToClientEvents } from '@svoice/shared';
import { useCusEvent } from './useCusEvent';

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// 開発時の HMR でこのモジュールが再実行されても参照を失わないよう、プラグインが提供するソケットを毎回取り出す
const getSocket = (): AppSocket => useNuxtApp().$socket;

export async function useConnectSocket() {
  const socket = getSocket();

  const { emit } = useCusEvent();

  const {
    gamerTag,
    playerData,
    isJoining,
    isSpeaking,
    adminSpeaker
  } = useComponents();

  socket.emit('join', gamerTag.value);

  await new Promise<void>((resolve) => {
    socket.on('joined', (data) => {
      adminSpeaker.value = new Set(data);
      resolve();
    })
  })

  socket.on('playerData', (data) => {
    playerData.value = data;
    emit('dataCycle', 'change');
  })

  socket.on('changeSetting', async () => {
    getIngameSettings();
  })

  socket.on('setAdminSpeaker', (data) => {
    adminSpeaker.value = new Set(data);
  })

  socket.on('kicked', () => {
    emit('exit', 'exit');
    useDisconnectSocket();

    isSpeaking.value = false;
    isJoining.value = false;
  })
}

export function useDisconnectSocket() {
  const socket = getSocket();
  socket.emit('exit');
  socket.off('joined');
  socket.off('playerData');
  socket.off('changeSetting');
  socket.off('setAdminSpeaker');
}

export function useSetSettingSocket() {
  getSocket().emit('changeSetting', 'change');
}

export function useOnAdminSpeaker() {
  getSocket().emit('onSpeaker');
}

export function useOffAdminSpeaker() {
  getSocket().emit('offSpeaker');
}

export function useKick(gamerTag: string) {
  getSocket().emit('kick', gamerTag);
}
