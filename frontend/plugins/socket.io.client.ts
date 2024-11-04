import { io, Socket } from 'socket.io-client'
import { defineNuxtPlugin } from '#app'

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig()
  const socket: Socket = io(config.public.server.socket.url, {
    secure: true,
    transports: ['websocket', 'polling']
  })

  nuxtApp.provide('socket', socket)
})