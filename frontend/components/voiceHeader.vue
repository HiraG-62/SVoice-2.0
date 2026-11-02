<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useAudioStore } from '../stores/audio';
import { useCallStore } from '../stores/call';
const { session } = useUserSession();
const discordAuth = session.value?.user?.discordAuth;
const audio = useAudioStore(), call = useCallStore();
const { muted: isSelfMute, noiseSuppression: isNoiseSuppression } = storeToRefs(audio);
const { gamerTag, inGame: isJoiningIngame, speaking: isSpeaking } = storeToRefs(call);
const isJoining = computed(() => call.status === 'joined');
const toggleNoiseSuppression = () => audio.setNoiseSuppression(!audio.noiseSuppression);
const settingDialog = ref<{ open(): void }>();
const openSetting = () => settingDialog.value?.open();
const adminSpeak = () => { if (call.speaking) useOffAdminSpeaker(); else useOnAdminSpeaker(); };
const toggleMute = (status: number) => useVoice().mute(status);
const exit = () => useVoice().leave();
</script>

<template>
  <v-container>
    <v-row justify="center" align-content="center" no-gutters class="ml-2">
      <v-col :cols="isJoining ? discordAuth ? 7 : 8 : 9">
        <v-toolbar-title>
          <v-icon size="x-large">mdi-account-circle</v-icon>
          {{ gamerTag }}
        </v-toolbar-title>
        <v-label>
          ステータス：
        </v-label>
        <span :class="isJoining && isJoiningIngame ? 'text-green' : 'text-red'" class="mr-4">
          {{ isJoining ? isJoiningIngame ? '参加中' : '待機中' : '未参加' }}
        </span>
      </v-col>
      <v-col :cols="isJoining ? discordAuth ? 5 : 4 : 3" class="d-flex justify-end align-center">
        <v-tooltip v-if="isJoining" text="退出" location="top">
          <template #activator="{ props }">
            <v-icon v-bind="props" size="x-large" @click="exit" :class="['mr-2']">
              mdi-phone-off
            </v-icon>
          </template>
        </v-tooltip>
        <v-tooltip v-if="isJoining && discordAuth" :text="isSpeaking ? '全体発言中' : '全体発言'" location="top">
          <template #activator="{ props }">
            <v-icon v-bind="props" size="x-large" @click="adminSpeak" :class="['mr-1']" :color="isSpeaking ? 'orange' : 'black'">
              mdi-bullhorn
            </v-icon>
          </template>
        </v-tooltip>
        <v-tooltip :text="isSelfMute ? 'ミュート解除' : 'ミュート'" location="top">
          <template #activator="{ props }">
            <v-icon v-bind="props" size="x-large" @click="toggleMute(1)" :class="['mr-1']" :color="isSelfMute ? 'red' : ''">
              {{ isSelfMute ? 'mdi-microphone-off' : 'mdi-microphone' }}
            </v-icon>
          </template>
        </v-tooltip>
        <v-tooltip :text="isNoiseSuppression ? 'ノイズ抑制解除' : 'ノイズ抑制'" location="top">
          <template #activator="{ props }">
            <v-icon v-bind="props" size="x-large" @click="toggleNoiseSuppression" :class="['mr-2']" :color="isNoiseSuppression ? 'green' : ''">
              mdi-waveform
            </v-icon>
          </template>
        </v-tooltip>
        <v-tooltip text="設定" location="top">
          <template #activator="{ props }">
            <v-icon v-bind="props" size="x-large" @click="openSetting" class="mr-2">mdi-cog</v-icon>
          </template>
        </v-tooltip>
        <setting-wrap ref="settingDialog"/>
      </v-col>
    </v-row>
  </v-container>
</template>
