import mitt from 'mitt';

type Events = {
  event: string
}

const emitter = mitt<Events>();

export function useCusEvent() {
  return {
    on: emitter.on,
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
    emit: exitEmitter.emit
  }
}