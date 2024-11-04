<script setup lang="ts">

const {
  themeColor,
  themeColorDark
} = useComponents();

const { stopListening } = useMicIndicator();

const setting = ref<boolean>(false);
const settingTabs = ref(1);

const closeSetting = () => {
  stopListening();
  setting.value = false;
}

const open = () => {
  setting.value = true;
}

defineExpose({
  open
})

</script>

<template>
  <v-dialog v-model="setting" fullscreen hide-overlay scrollable transition="dialog-bottom-transition">
    <v-card>
      <v-toolbar dark :color="themeColor">
        <v-btn icon dark @click="closeSetting">
          <v-icon>mdi-close</v-icon>
        </v-btn>
        <v-toolbar-title>設定</v-toolbar-title>
      </v-toolbar>
      <v-tabs v-model="settingTabs" :color="themeColorDark(1).value" fixed-tabs>
        <v-tab value="general" width="33%">一般</v-tab>
        <v-tab value="sound" width="33%">サウンド</v-tab>
        <v-tab value="ingame" width="33%">インゲーム</v-tab>
      </v-tabs>
      <v-tabs-window v-model="settingTabs" style="overflow-y: auto;">
        <v-tabs-window-item value="general">
          <general-setting v-model="setting" class="mt-10"/>
        </v-tabs-window-item>
        <v-tabs-window-item value="sound">
          <voice-setting v-model="setting" class="mt-10" />
        </v-tabs-window-item>
        <v-tabs-window-item value="ingame">
          <ingame-setting v-model="setting" class="mt-10" />
        </v-tabs-window-item>
      </v-tabs-window>
    </v-card>
  </v-dialog>
</template>