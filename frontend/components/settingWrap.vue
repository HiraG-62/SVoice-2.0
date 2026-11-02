<script setup lang="ts">
const { session } = useUserSession();

const discordAuth = session.value?.user?.discordAuth;


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
        <v-tab value="general">一般</v-tab>
        <v-tab value="sound">サウンド</v-tab>
        <v-tab v-if="discordAuth" value="ingame">インゲーム</v-tab>
        <v-tab v-if="discordAuth" value="joinLocks">参加ロック</v-tab>
      </v-tabs>
      <v-tabs-window v-model="settingTabs" style="overflow-y: auto;">
        <v-tabs-window-item value="general">
          <general-setting v-model="setting" class="mt-10"/>
        </v-tabs-window-item>
        <v-tabs-window-item value="sound">
          <voice-setting v-model="setting" class="mt-10" />
        </v-tabs-window-item>
        <v-tabs-window-item v-if="discordAuth" value="ingame">
          <ingame-setting v-model="setting" class="mt-10" />
        </v-tabs-window-item>
        <v-tabs-window-item v-if="discordAuth" value="joinLocks">
          <join-locks class="mt-10" />
        </v-tabs-window-item>
      </v-tabs-window>
    </v-card>
  </v-dialog>
</template>
