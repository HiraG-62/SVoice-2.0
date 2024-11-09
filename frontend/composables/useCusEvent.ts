import mitt from 'mitt';

type Events = {
  dataCycle: string,
  exit: string,
  mute: number
}

const emitter = mitt<Events>();

export function useCusEvent() {
  return {
    on: emitter.on,
    off: emitter.off,
    emit: emitter.emit
  }
}