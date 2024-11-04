<script setup lang="ts">
const { user, session, loggedIn} = useUserSession();

const loading = ref<boolean>(true);
const joinLoad = ref<boolean>(false);

const {
  gamerTag,
  isJoining,
  phoneLevel,
  micLevel
} = useComponents();

if(session.value.user) {
  gamerTag.value = (session.value?.user as { discordId: string; gamerTag: string }).gamerTag
}


const route = useRoute()
const errorMessage = computed(() => {
  const error = route.query.error
  if(error == 'authentication_error') {
    return 'Discord認証に失敗しました。';
  } else if(error == 'discrod_nickname_error') {
    return 'Discordサーバーのニックネーム設定に不備があります。';
  } else {
    return '';
  }
})

const loginClick = async () => {
  await navigateTo('/auth/discord', { external: true });
}

const joinClick = async () => {
  joinLoad.value = true;

  await useConnectSocket();
  useConnectSkyway(gamerTag.value);

  joinLoad.value = false;
  isJoining.value = true;
}

onMounted(async () => {
  if(loggedIn) {
    await useAudio();
    await useAudioDevice();
  
    await getIngameSettings();
  }
  loading.value = false;
})

</script>

<template>
  <v-app class="background">
    <v-main>
      <v-overlay v-model="loading" absolute z-index="0" class="align-center justify-center">
        <v-progress-circular indeterminate size="64" color="blue"></v-progress-circular>
      </v-overlay>
      <v-container v-if="!loading" fill-height>
        <v-row justify="center" no-gutters>
          <img src="/public/images/logo.png" alt="" height="150px">
        </v-row>
        <v-row justify="center" align-content="center" no-gutters>
          <v-col cols="10" sm="10" md="8" lg="8" xl="8">
            <v-container id="main-container">
              <v-card color="#fffc" height="70vh">
                <AuthState>
                  <template #default="{ loggedIn, clear }">
                    <div v-if="loggedIn">
                      <v-toolbar height="80">
                        <voice-header />
                      </v-toolbar>
                      <v-row id="main" justify="center" align-content="center" no-gutters>
                        <v-btn v-if="!isJoining && !joinLoad" @click="joinClick" color="green" width="200">参加</v-btn>
                        <v-progress-circular v-else-if="joinLoad" indeterminate size="64"
                          color="blue"></v-progress-circular>
                        <user-list v-else-if="isJoining" />
                      </v-row>
                    </div>
                    <div v-else>
                      <v-row id="main-login" justify="center" align-content="center" no-gutters>
                        <div v-if="errorMessage">
                          <v-col cols="12">
                            <p class="text-center text-red">※{{ errorMessage }}</p>
                          </v-col>
                        </div>
                        <v-col cols="12">
                          <p class="text-center" style="font-weight: bold;">Discord認証されていません。</p>
                        </v-col>
                        <v-col cols="12">
                          <p class="text-center mb-10" style="font-weight: bold;">ログインしてください。</p>
                        </v-col>
                        <v-col cols="12" class="text-center">
                          <v-btn @click="loginClick" color="#5865f2" width="200" >ログイン</v-btn>
                        </v-col>
                      </v-row>
                    </div>
                  </template>
                </AuthState>
              </v-card>
            </v-container>
          </v-col>
        </v-row>
      </v-container>
    </v-main>
  </v-app>
</template>

<style scoped>
.background {
  width: 100vw;
  height: 100vh;

  background-image: url('/public/images/background.png');
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

#main {
  height: calc(70vh - 80px);
}

#main-login {
  height: calc(70vh);
}

.table {
  background-color: #fff5;
}
</style>