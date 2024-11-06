<script setup lang="ts">
const { session } = useUserSession();

const discordAuth = (session.value?.user as { discordId: string; discordAuth: boolean; gamerTag: string }).discordAuth;

const { userList } = useComponents();

const dialog = ref<boolean>(false);

const headers: any[] = [
  {
    title: 'ゲーマータグ',
    align: 'start',
    sortable: true,
    key: 'gamerTag',
    width: '30%'
  },
  {
    title: '音量',
    align: 'center',
    sortable: false,
    key: 'volume',
    width: '40%'
  }
]

const kick = (gamerTag: string) => {
  useKick(gamerTag);
  dialog.value = false;
}

onMounted(() => {
})

</script>


<template>
  <v-data-table items-per-page="-1" :headers="headers" :items="userList" :hide-default-footer="true"
    :fixed-header="true" no-data-text="他プレイヤーがいません。" class="fill-height table">
    <template v-slot:item.gamerTag="{ item }">
      <div v-if="discordAuth">
        <span @click="dialog = true" class="cursor-pointer"><v-icon
            :color="item.voice ? 'green' : 'black'">mdi-volume-high</v-icon> {{ item.gamerTag }}</span>
        <v-dialog v-model="dialog" max-width="400">
          <v-card>
            <v-card-title class="text-h5">キック確認</v-card-title>
            <v-card-text>{{ item.gamerTag }}をキックします。</v-card-text>
            <v-card-actions>
              <v-spacer></v-spacer>
              <v-btn @click="dialog = false" color="darkblue">キャンセル</v-btn>
              <v-btn @click="kick(item.gamerTag)" color="red">確認</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
      </div>
      <div v-else>
        <span><v-icon :color="item.voice ? 'green' : 'black'">mdi-volume-high</v-icon> {{ item.gamerTag }}</span>
      </div>
    </template>
    <template v-slot:item.volume="{ item }">
      <v-slider v-model="item.gain" :max="2" :min="0" :step="0.01"></v-slider>
    </template>
  </v-data-table>
</template>