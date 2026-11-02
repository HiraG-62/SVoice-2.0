<script setup lang="ts">
const { loggedIn, clear } = useUserSession();
const { emit } = useCusEvent()

const logout = () => {
  emit('exit', 'exit');
  useDisconnectSocket();
  useComponents().isJoining.value = false;
  clear();
}

const sendDebug = () => {
  emit('debug', 'debug');
}
</script>

<template>
  <v-list>
    <AuthState>
      <template #default="{ loggedIn, clear }">
        <v-row justify="center" no-gutters>
          <v-col cols="10" sm="10" md="8" lg="6" xl="6">
            <v-list-item>
              <v-list-item-subtitle>
                Discord認証
              </v-list-item-subtitle>
              <v-btn @click="logout" color="red">ログアウト</v-btn>
            </v-list-item>
            <v-list-item>
              <v-list-item-subtitle>
                デバッグ用 <span class="text-red">※運営の指示以外で押さないでください</span>
              </v-list-item-subtitle>
              <v-btn @click="sendDebug" color="red">送信</v-btn>
            </v-list-item>
          </v-col>
        </v-row>
      </template>
    </AuthState>
  </v-list>
</template>
