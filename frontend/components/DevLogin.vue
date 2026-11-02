<script setup lang="ts">
const config = useRuntimeConfig();
const enabled = import.meta.dev && config.public.devLoginEnabled === true;
const presets = import.meta.dev
  ? (config.public.devLoginPresets || '').split(',').map(tag => tag.trim()).filter(Boolean)
  : [];
const gamerTag = ref('');
const admin = ref(false);
const pending = ref(false);
const error = ref('');

async function login(tag: string) {
  pending.value = true;
  error.value = '';
  try {
    await $fetch('/auth/dev', { method: 'POST', body: { gamerTag: tag, admin: admin.value } });
    await navigateTo('/', { external: true });
  } catch {
    error.value = 'ログイン失敗';
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <v-container v-if="enabled" style="max-width: 400px;">
    <h3 class="text-center mb-3">開発用ログイン</h3>
    <v-form @submit.prevent="login(gamerTag)">
      <v-text-field v-model="gamerTag" label="ゲーマータグ" :maxlength="100" hide-details />
      <v-checkbox v-model="admin" label="管理者" hide-details />
      <v-btn type="submit" :disabled="!gamerTag || pending" :loading="pending">ログイン</v-btn>
      <v-btn v-for="tag in presets" :key="tag" class="ml-2 mb-2" :disabled="pending" @click="login(tag)">{{ tag }}</v-btn>
      <p v-if="error" class="text-red mt-2">{{ error }}</p>
    </v-form>
  </v-container>
</template>
