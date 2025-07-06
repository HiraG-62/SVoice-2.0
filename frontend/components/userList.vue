<script setup lang="ts">
const { session } = useUserSession();

const discordAuth = (session.value?.user as { discordId: string; discordAuth: boolean; gamerTag: string }).discordAuth;

const { themeColor, userList, nearbyUserList } = useComponents();

const dialog = ref<boolean>(false);
const selectedUser = ref<string | null>(null);
const userListTabs = ref(0);

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

const gamerTagHeaders: any[] = [
  {
    title: 'ゲーマータグ',
    align: 'start',
    sortable: true,
    key: 'gamerTag',
    width: '100%'
  },
]

function openDialog(gamerTag: string) {
  selectedUser.value = gamerTag;
  dialog.value = true;
}

const kick = (gamerTag: string) => {
  useKick(gamerTag);
  dialog.value = false;
}

onMounted(() => {
})

</script>


<template>
  <div class="h-100 w-100">
    <v-tabs v-model="userListTabs" bg-color="white" fixed-tabs>
      <v-tab :color="themeColor" value="nearby" width="50%" style="max-width: 100%;">近くのプレイヤー</v-tab>
      <v-tab :color="themeColor" value="all" width="50%" style="max-width: 100%;">全てのプレイヤー</v-tab>
    </v-tabs>
    <v-tabs-window v-model="userListTabs" class="h-100">
      <v-tabs-window-item value="nearby" class="h-100">
        <v-data-table items-per-page="-1" :headers="headers" :items="nearbyUserList" :hide-default-footer="true"
          :fixed-header="true" no-data-text="近くにプレイヤーがいません。" class="h-100 table">
          <template v-slot:item.gamerTag="{ item }">
            <div v-if="discordAuth">
              <span @click="openDialog(item.gamerTag)" class="cursor-pointer"><v-icon
                  :color="item.voice ? 'green' : 'black'">mdi-volume-high</v-icon> {{ item.gamerTag }}</span>
              <v-dialog v-model="dialog" max-width="400">
                <v-card>
                  <v-card-title class="text-h5">キック確認</v-card-title>
                  <v-card-text>{{ selectedUser }}をキックします。</v-card-text>
                  <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn @click="dialog = false" color="darkblue">キャンセル</v-btn>
                    <v-btn @click="kick(selectedUser!)" color="red">確認</v-btn>
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
      </v-tabs-window-item>
      <v-tabs-window-item value="all" class="h-100">
        <v-data-table items-per-page="-1" :headers="gamerTagHeaders" :items="userList" :hide-default-footer="true"
          :fixed-header="true" no-data-text="他プレイヤーがいません。" class="h-100 table">
          <template v-slot:item.gamerTag="{ item }">
            <div v-if="discordAuth">
              <span @click="openDialog(item.gamerTag)" class="cursor-pointer"> {{ item.gamerTag }}</span>
              <v-dialog v-model="dialog" max-width="400">
                <v-card>
                  <v-card-title class="text-h5">キック確認</v-card-title>
                  <v-card-text>{{ selectedUser }}をキックします。</v-card-text>
                  <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn @click="dialog = false" color="darkblue">キャンセル</v-btn>
                    <v-btn @click="kick(selectedUser!)" color="red">確認</v-btn>
                  </v-card-actions>
                </v-card>
              </v-dialog>
            </div>
            <div v-else>
              <span> {{ item.gamerTag }}</span>
            </div>
          </template>
          <template v-slot:item.volume="{ item }">
            <v-slider v-model="item.gain" :max="2" :min="0" :step="0.01"></v-slider>
          </template>
        </v-data-table>
      </v-tabs-window-item>
    </v-tabs-window>
  </div>
</template>