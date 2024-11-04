export default defineNuxtConfig({
  modules: [
    '@nuxt/image',
    'nuxt-auth-utils'
  ],

  css: [
    "vuetify/lib/styles/main.sass"
  ],

  build: {
    transpile: ["vuetify"]
  },

  vite: {
    define: {
      "process.env.DEBUG": false
    },
    // for HMR
    server: {
      watch: {
        usePolling: true
      }
    },
  },

  runtimeConfig: {
    public: {
      skywayAppId: process.env.NUXT_PUBLIC_SKYWAY_APP_ID || '',
      skywaySecretKey: process.env.NUXT_PUBLIC_SKYWAY_SECRET_KEY || '',
      server: {
        socket: {
          url: process.env.NUXT_PUBLIC_SERVER_SOCKET_URL || '',
        }
      }
    },
    oauth: {
      discord: {
        clientId: process.env.NUXT_OAUTH_DISCORD_CLIENT_ID || '',
        clientSecret: process.env.NUXT_OAUTH_DISCORD_CLIENT_SECRET || '',
        redirectURL: process.env.NUXT_OAUTH_DISCORD_REDIRECT_URL || '',
      },
    }
  },

  compatibilityDate: '2024-10-27',
})