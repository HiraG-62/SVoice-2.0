<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useCallStore } from '../stores/call';
import { joinAuthMessage, loginErrorMessage } from '~/utils/authMessages';

const { session, loggedIn } = useUserSession();
const loading = ref(false);
const joinLoad = ref(false);
const joinAuth = ref(false);
const authPending = ref(false);
const authLocked = ref(false);
const authError = ref('');
const password = ref('');
const call = useCallStore();
const { error: errorMessage } = storeToRefs(call);
const isJoining = computed(() => call.status === 'joined');
if (session.value?.user) call.identify(session.value.user.gamerTag);

call.setError(loginErrorMessage(useRoute().query.error));

const loginClick = () => navigateTo('/auth/discord', { external: true });

const joinAuthClick = async () => {
  authPending.value = true;
  authError.value = '';
  try {
    const result = await $fetch('/api/joinAuth', { method: 'POST', body: { pass: password.value } });
    joinAuth.value = result.ok;
    authLocked.value = result.locked;
    authError.value = joinAuthMessage(result);
  } catch {
    authError.value = '参加認証に失敗しました';
  } finally {
    authPending.value = false;
  }
};

const joinClick = async () => {
  joinLoad.value = true;
  call.setError('');
  try { await useVoice().join(); } finally { joinLoad.value = false; }
};

onMounted(async () => {
  if (!loggedIn.value) return;
  try {
    joinAuth.value = await $fetch('/api/getJoinRole');
    await useVoice().initialize();
  } catch {
    call.setError('マイク・距離設定の初期化失敗');
  } finally {
    loading.value = false;
  }
});

</script>

<template>
  <v-app class="background">
    <v-main>
      <!-- <v-overlay v-model="loading" absolute z-index="0" class="align-center justify-center">
        <v-progress-circular indeterminate size="64" color="blue"></v-progress-circular>
      </v-overlay> -->
      <v-container v-if="!loading" fill-height>
        <v-row justify="center" no-gutters>
          <img src="/public/images/logo.png" alt="" height="150px">
        </v-row>
        <v-row justify="center" align-content="center" no-gutters>
          <v-col cols="12" sm="12" md="8" lg="8" xl="8">
            <v-container id="main-container">
              <v-card color="#fffc" height="70vh">
                <AuthState>
                  <template #default="{ loggedIn, clear }">
                    <div v-if="loggedIn">
                      <div v-if="!joinAuth">
                        <v-row align-content="center" no-gutters>
                          <v-col cols="12">
                            <v-spacer class="mb-10"></v-spacer>
                          </v-col>
                          <v-col cols="12" class="text-center mb-10">
                            <h2>参加認証</h2>
                          </v-col>
                        </v-row>
                        <v-row justify="center" align-content="center" no-gutters>
                          <v-col cols="12">
                            <p class="text-center text-red mb-5" role="alert">{{ authError }}</p>
                          </v-col>
                          <v-col cols="12" class="d-flex justify-center align-center">
                            <v-text-field v-model="password" :disabled="authLocked || authPending" type="text" bg-color="white" name="input-10-1" label="パスワード" style="max-width: 300px;" ></v-text-field>
                            <v-btn :disabled="authLocked || authPending" :loading="authPending" @click="joinAuthClick" color="#5865f2" width="80" class="ml-4">送信</v-btn>
                          </v-col>
                        </v-row>
                      </div>
                      <div v-else>
                        <v-toolbar height="80">
                          <voice-header />
                        </v-toolbar>
                        <v-row id="main" justify="center" align-content="center" no-gutters>
                          <div v-if="errorMessage">
                            <v-col cols="12">
                              <p class="text-center text-red">※{{ errorMessage }}</p>
                            </v-col>
                          </div>
                          <v-btn v-if="!isJoining && !joinLoad" @click="joinClick" color="green" width="200">参加</v-btn>
                          <v-progress-circular v-else-if="joinLoad" indeterminate size="64"
                            color="blue"></v-progress-circular>
                          <user-list v-else-if="isJoining" />
                        </v-row>
                      </div>
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
                          <v-btn @click="loginClick" color="#5865f2" width="200">ログイン</v-btn>
                        </v-col>
                        <v-col cols="12">
                          <DevLogin />
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
