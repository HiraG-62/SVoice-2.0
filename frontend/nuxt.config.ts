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

  nitro: {
    preset: 'node-listener',
    serveStatic: true,
  },

  runtimeConfig: {
    dataDir: 'data',
    devLoginEnabled: false,
    // サーバーサイドのみ（クライアントに露出しない）
    skywayAppId: '',
    skywaySecretKey: '',
    apiSecret: '',
    public: {
      skywayRoomName: 'test',
      server: {
        socket: {
          url: '',
        },
        api: {
          url: '',
          sslurl: ''
        }
      }
    },
    oauth: {
      discord: {
        clientId: '',
        clientSecret: '',
        redirectURL: '',
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
