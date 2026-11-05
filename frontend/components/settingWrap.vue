<script setup lang="ts">
import { useDisplay } from 'vuetify';
const { smAndDown } = useDisplay();
const { session } = useUserSession();

const discordAuth = session.value?.user?.discordAuth;


const { themeColor, themeColorDark } = useThemeColor();

const DESKTOP_HEIGHT = 'min(600px, 90dvh)';

const setting = ref<boolean>(false);
const settingTabs = ref(1);

const closeSetting = () => {
  useVoice().mic.stopTest();
  setting.value = false;
}

const updateSetting = (open: boolean) => {
  if (!open) { closeSetting(); return; }
  setting.value = true;
};

const open = () => {
  setting.value = true;
}

defineExpose({
  open
})

</script>

<template>
  <v-dialog :model-value="setting" @update:model-value="updateSetting" :fullscreen="smAndDown" :width="smAndDown ? undefined : 800" :max-width="smAndDown ? undefined : '90vw'" :height="smAndDown ? undefined : DESKTOP_HEIGHT" scrollable :transition="smAndDown ? 'dialog-bottom-transition' : 'dialog-transition'">
    <v-card :style="{ maxHeight: smAndDown ? '100dvh' : undefined }">
      <v-toolbar dark :color="themeColor" class="flex-shrink-0">
        <v-btn icon dark @click="closeSetting">
          <v-icon>mdi-close</v-icon>
        </v-btn>
        <v-toolbar-title>設定</v-toolbar-title>
      </v-toolbar>
      <v-tabs v-model="settingTabs" :color="themeColorDark(1)" fixed-tabs class="flex-shrink-0">
        <v-tab value="general">一般</v-tab>
        <v-tab value="sound">サウンド</v-tab>
        <v-tab v-if="discordAuth" value="ingame">インゲーム</v-tab>
        <v-tab v-if="discordAuth" value="joinLocks">参加ロック</v-tab>
      </v-tabs>
      <v-tabs-window v-model="settingTabs" style="overflow-y: auto; min-height: 0;">
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
