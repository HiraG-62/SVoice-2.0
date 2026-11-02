import { io, Socket } from 'socket.io-client'
import type { ClientToServerEvents, ServerToClientEvents } from '@svoice/shared';
import { defineNuxtPlugin } from '#app'

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(config.public.server.socket.url, {
    secure: true,
    transports: ['websocket', 'polling']
  })

  return { provide: { socket } }
})
