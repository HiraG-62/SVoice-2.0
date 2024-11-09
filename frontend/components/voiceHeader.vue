<script setup lang="ts">
const { session } = useUserSession();

const discordAuth = (session.value?.user as { discordId: string; discordAuth: boolean; gamerTag: string }).discordAuth;

const { on, emit } = useCusEvent()

const {
  gamerTag,
  isSelfMute,
  isNoiseSuppression,
  isJoining,
  isJoiningIngame,
  isSpeaking
} = useComponents();

const toggleNoiseSuppression = () => {
  isNoiseSuppression.value = !isNoiseSuppression.value;
  useNoiseSuppression();
}

const settingDialog = ref();

const openSetting = () => {
  if(settingDialog.value) {
    settingDialog.value.open();
  }
}

const adminSpeak = () => {
  if(isSpeaking.value) {
    useOffAdminSpeaker();
    isSpeaking.value = false;
  } else {
    useOnAdminSpeaker();
    isSpeaking.value = true;
  }
}

const toggleMute = (status: number) => {
  if ((status === 1 && !isSelfMute.value) || (status === 2 && !isSelfMute.value)) {
    new Audio('/sounds/mute.mp3').play();
    isSelfMute.value = true;
  } else if ((status === 1 && isSelfMute.value) || (status === 3 && isSelfMute.value)) {
    new Audio('/sounds/unmute.mp3').play();
    isSelfMute.value = false;
  }
}

const exit = () => {
  emit('exit', 'exit');
  useDisconnectSocket();

  isSpeaking.value = false;
  isJoining.value = false;
}

on('mute', (status: number) => toggleMute(status));

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