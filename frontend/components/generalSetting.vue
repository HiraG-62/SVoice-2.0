<script setup lang="ts">
import { useNotificationStore } from '../stores/notification';
const { clear } = useUserSession();
const logout = async () => { await useVoice().leave(); await clear(); };
const notification = useNotificationStore();
const sending = ref(false);
const sendDebug = async () => {
  if (sending.value) return;
  sending.value = true;
  try {
    const ok = await useVoice().sendDebug();
    notification.show(ok ? '送信完了' : '送信失敗', ok ? 'success' : 'error');
  } catch {
    notification.show('送信失敗', 'error');
  } finally {
    sending.value = false;
  }
};
</script>

<template>
  <v-list>
    <AuthState>
      <template #default="{ loggedIn, clear }">
        <v-row justify="center" no-gutters>
          <v-col cols="10">
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
              <v-btn @click="sendDebug" :loading="sending" :disabled="sending" color="red">送信</v-btn>
            </v-list-item>
          </v-col>
        </v-row>
      </template>
    </AuthState>
  </v-list>
</template>
