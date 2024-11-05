import { Socket } from 'socket.io-client'
import { useCusEvent } from './useCusEvent';

let socket: Socket;

export async function useConnectSocket() {
  const { $socket } = useNuxtApp();
  socket = $socket as Socket;

  const { emit } = useCusEvent();

  const {
    gamerTag,
    playerData
  } = useComponents();

  socket.emit('join', gamerTag.value);

  await new Promise<void>((resolve) => {
    socket.on('joined', () => {
      resolve();
    })
  })

  socket.on('playerData', (data) => {
    playerData.value = data;
    emit('event', 'change');
  })

  socket.on('changeSetting', async () => {
    getIngameSettings();
  })
}

export function useDisconnectSocket() {
  socket.off('playerData');
  socket.off('changeSetting');
}

export function useSetSettingSocket() {
  if (!socket) {
    const { $socket } = useNuxtApp();
    socket = $socket as Socket;
  }
  socket.emit('changeSetting', 'change');
}