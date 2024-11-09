import { Socket } from 'socket.io-client'
import { useCusEvent } from './useCusEvent';

let socket: Socket;

export async function useConnectSocket() {
  const { $socket } = useNuxtApp();
  socket = $socket as Socket;

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
    socket.on('joined', (data: Array<string>) => {
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

  socket.on('setAdminSpeaker', (data: Array<string>) => {
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
  socket.emit('exit');
  socket.off('joined');
  socket.off('playerData');
  socket.off('changeSetting');
  socket.off('setAdminSpeaker');
}

export function useSetSettingSocket() {
  if (!socket) {
    const { $socket } = useNuxtApp();
    socket = $socket as Socket;
  }
  socket.emit('changeSetting', 'change');
}

export function useOnAdminSpeaker() {
  socket.emit('onSpeaker');
}

export function useOffAdminSpeaker() {
  socket.emit('offSpeaker');
}

export function useKick(gamerTag: string) {
  socket.emit('kick', gamerTag);
}