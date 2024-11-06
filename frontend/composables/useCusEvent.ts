import mitt from 'mitt';

type Events = {
  event: string
}

const emitter = mitt<Events>();

export function useCusEvent() {
  return {
    on: emitter.on,
    off: emitter.off,
    emit: emitter.emit
  }
}

type Exit = {
  exit: string
}

const exitEmitter = mitt<Exit>();

export function useExitEvent() {
  return {
    on: exitEmitter.on,
    off: exitEmitter.off,
    emit: exitEmitter.emit
  }
}