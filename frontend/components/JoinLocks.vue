<script setup lang="ts">
const locks = ref<{ id: string; gamerTag: string; lockedAt: string }[]>([]);
const pending = ref(false);
const error = ref('');

async function load() {
  pending.value = true;
  error.value = '';
  try {
    locks.value = await $fetch('/api/admin/joinLocks');
  } catch {
    error.value = '参加ロック取得失敗';
  } finally {
    pending.value = false;
  }
}

async function unlock(id: string) {
  pending.value = true;
  error.value = '';
  try {
    await $fetch('/api/admin/unlockJoin', { method: 'POST', body: { id } });
    await load();
  } catch {
    error.value = 'ロック解除失敗';
  } finally {
    pending.value = false;
  }
}

onMounted(load);
</script>

<template>
  <v-container style="max-width: 900px;">
    <v-btn :loading="pending" :disabled="pending" class="mb-4" @click="load">更新</v-btn>
    <p v-if="error" class="text-red" role="alert">{{ error }}</p>
    <v-table v-if="locks.length">
      <thead><tr><th>ゲーマータグ</th><th>ロック日時</th><th></th></tr></thead>
      <tbody>
        <tr v-for="lock in locks" :key="lock.id">
          <td>{{ lock.gamerTag }}</td>
          <td>{{ new Date(lock.lockedAt).toLocaleString('ja-JP') }}</td>
          <td><v-btn :disabled="pending" @click="unlock(lock.id)">解除</v-btn></td>
        </tr>
      </tbody>
    </v-table>
    <p v-else-if="!pending && !error">ロック中のユーザーはいません</p>
  </v-container>
</template>
