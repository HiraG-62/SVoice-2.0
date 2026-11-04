<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useAudioStore } from '../stores/audio';
import { useCallStore } from '../stores/call';
import { DEFAULT_LEVEL, NORMAL_LEVEL_MAX, EXTENDED_LEVEL_MAX } from '../services/constants';
import { sliderColor } from '../utils/sliderColor';
const { themeColor, themeColorLight } = useThemeColor();
const audio = useAudioStore(), call = useCallStore();
const { inputs: audioInputs, outputs: audioOutputs } = storeToRefs(audio);
const micLevel = computed({ get: () => audio.micLevel, set: v => audio.setMicLevel(v) });
const phoneLevel = computed({ get: () => audio.phoneLevel, set: v => audio.setPhoneLevel(v) });
const isNoiseSuppression = computed({ get: () => audio.noiseSuppression, set: v => audio.setNoiseSuppression(v) });
const selectedInput = computed({ get: () => audio.selectedInput, set: v => audio.selectInput(v) });
const selectedOutput = computed({ get: () => audio.selectedOutput, set: v => audio.selectOutput(v) });
const isJoining = computed(() => call.status === 'joined');
const isExtendsMic = ref(false), isMicTest = ref(false), micIndicator = ref(0);
const dialogOpen = defineModel<boolean>();
const micMax = computed(() => isExtendsMic.value ? EXTENDED_LEVEL_MAX : NORMAL_LEVEL_MAX);
const phoneMax = NORMAL_LEVEL_MAX, micMin = 0, phoneMin = 0, micIndicatorMin = 0;
const micIndicatorMax = DEFAULT_LEVEL / 2;
const micIndicatorColor = computed(() => sliderColor(micIndicator.value, micIndicatorMax));
const micExtensionHint = `入力音量の上限 ${NORMAL_LEVEL_MAX} → ${EXTENDED_LEVEL_MAX}。声が小さいとき用`;
const changePhoneVolume = () => audio.setPhoneLevel(Math.min(phoneLevel.value, phoneMax));
const changeMicVolume = () => audio.setMicLevel(Math.min(micLevel.value, micMax.value));
const clickExtendsMic = () => { isExtendsMic.value = !isExtendsMic.value; changeMicVolume(); };
const toggleMicTest = () => {
  if (isMicTest.value) { useVoice().mic.stopTest(); isMicTest.value = false; return; }
  isMicTest.value = useVoice().mic.startTest(value => { micIndicator.value = value; });
};
watch(() => audio.ready, ready => { if (!ready) isMicTest.value = false; });
watch(dialogOpen, open => {
  if (open) return;
  useVoice().mic.stopTest();
  isMicTest.value = false;
});
onUnmounted(() => useVoice().mic.stopTest());
</script>

<template>
  <v-list>
    <v-row justify="center" no-gutters>
      <v-col cols="12" sm="6">
        <v-list-item>
          <v-list-item-subtitle class="setting-label">入力デバイス<span v-show="isJoining" class="text-red ml-4">※入室後は変更できません</span></v-list-item-subtitle>
          <v-select :disabled="isJoining" v-model="selectedInput" :items="audioInputs" item-value="label" item-title="label" return-object variant="outlined"></v-select>
        </v-list-item>
        <v-list-item>
          <v-list-item-subtitle class="setting-label">
            入力音量
            <span @click="clickExtendsMic" style="cursor: pointer;" class="ml-4">
              上限拡張
              <v-icon :color="isExtendsMic ? 'red' : ''">
                {{ isExtendsMic ? 'mdi-lock-open-variant' : 'mdi-lock' }}
              </v-icon>
            </span>
            <v-tooltip :text="micExtensionHint" open-on-click>
              <template #activator="{ props }">
                <v-btn v-bind="props" icon="mdi-information-outline" variant="text" size="x-small" :aria-label="micExtensionHint" />
              </template>
            </v-tooltip>
          </v-list-item-subtitle>
          <v-slider v-model="micLevel" :color="themeColorLight(2)" :min="micMin" :max="micMax" :step="0.1"
            style="padding-left: 15px;">
            <template #append>
              <v-text-field @input="changeMicVolume" v-model="micLevel" density="compact" style="width: 100px"
                type="number" hide-details single-line></v-text-field>
            </template>
          </v-slider>
        </v-list-item>
      </v-col>
      <v-col cols="12" sm="6">
        <v-list-item>
          <v-list-item-subtitle class="setting-label">出力デバイス<span class="text-red ml-4">※OS の既定の出力を使用</span></v-list-item-subtitle>
          <v-select disabled v-model="selectedOutput" :items="audioOutputs" item-value="label" item-title="label" :readonly="true" variant="outlined"></v-select>
        </v-list-item>
        <v-list-item>
          <v-list-item-subtitle>出力音量</v-list-item-subtitle>
          <v-slider v-model="phoneLevel" :color="themeColorLight(2)" :min="phoneMin" :max="phoneMax" :step="0.1"
            style="padding-left: 15px;">
            <template #append>
              <v-text-field @input="changePhoneVolume" v-model="phoneLevel" density="compact" style="width: 100px"
                type="number" hide-details single-line></v-text-field>
            </template>
          </v-slider>
        </v-list-item>
      </v-col>
    </v-row>
    <v-row justify="center" no-gutters>
      <v-col cols="12" sm="10">
        <v-list-item>
          <v-list-item-subtitle>マイクテスト</v-list-item-subtitle>
          <v-switch v-model="isNoiseSuppression" :color="themeColor" label="ノイズ抑制" inset class="ml-4"/>
          <v-slider v-model="micIndicator" :min="micIndicatorMin" :max="micIndicatorMax" :color="micIndicatorColor"
            thumb-size="none" readonly>
            <template #prepend>
              <v-btn @click="toggleMicTest" :color="isMicTest ? themeColorLight(3) : '#ddd'" width="100">
                {{ isMicTest ? 'テスト中' : 'テスト' }}
                <v-icon :color="isMicTest ? '' : 'red'">
                  {{ isMicTest ? 'mdi-microphone' : 'mdi-microphone-off' }}
                </v-icon>
              </v-btn>
            </template>
          </v-slider>
        </v-list-item>
      </v-col>
    </v-row>
  </v-list>
</template>

<style scoped>
.setting-label {
  white-space: normal;
}
</style>
