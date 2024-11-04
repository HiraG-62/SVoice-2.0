import { io, Socket } from 'socket.io-client'
import { defineNuxtPlugin } from '#app'

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig()
  const socket: Socket = io(config.public.server.socket.url)

  nuxtApp.provide('socket', socket)
})