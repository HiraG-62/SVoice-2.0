<script setup lang="ts">
const { userList } = useComponents();

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

onMounted(() => {
})

</script>


<template>
  <v-data-table items-per-page="-1" :headers="headers" :items="userList" :hide-default-footer="true"
    :fixed-header="true" no-data-text="他プレイヤーがいません。" class="fill-height table">
    <template v-slot:item.gamerTag="{ item }">
      <span><v-icon :color="item.voice ? 'green' : 'black'">mdi-volume-high</v-icon> {{ item.gamerTag }}</span>
    </template>
    <template v-slot:item.volume="{ item }">
      <v-slider v-model="item.gain" :max="2" :min="0" :step="0.01"></v-slider>
    </template>
  </v-data-table>
</template>