const DEFAULT_FRONTEND_PORT = 3000;

export default defineNuxtConfig({
  devServer: {
    port: Number(process.env.NUXT_PORT || DEFAULT_FRONTEND_PORT),
  },
  modules: [
    '@nuxt/image',
    '@pinia/nuxt',
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
    dataDir: 'data',
    devLoginEnabled: false,
    // サーバーサイドのみ（クライアントに露出しない）
    skywayAppId: process.env.NUXT_SKYWAY_APP_ID || '',
    skywaySecretKey: process.env.NUXT_SKYWAY_SECRET_KEY || '',
    apiSecret: process.env.NUXT_API_SECRET || '',
    public: {
      skywayRoomName: 'test',
      server: {
        socket: {
          url: process.env.NUXT_PUBLIC_SERVER_SOCKET_URL || '',
        },
        api: {
          url: process.env.NUXT_PUBLIC_SERVER_API_URL || '',
          sslurl: process.env.NUXT_PUBLIC_SERVER_API_SSLURL || ''
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

  $development: {
    runtimeConfig: {
      public: {
        devLoginEnabled: process.env.NUXT_DEV_LOGIN_ENABLED === 'true',
        devLoginPresets: process.env.NUXT_PUBLIC_DEV_LOGIN_PRESETS || '',
      },
    },
  },

  compatibilityDate: '2024-10-27',
})
