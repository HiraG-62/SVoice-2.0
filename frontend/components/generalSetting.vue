<script setup lang="ts">
import type { Socket } from 'socket.io-client';

const { loggedIn, clear } = useUserSession();
const { $socket } = useNuxtApp()

const logout = () => {
  const socket = $socket as Socket;
  socket.disconnect();
  clear();
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
          </v-col>
        </v-row>
      </template>
    </AuthState>
  </v-list>
</template>