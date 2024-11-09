<script setup lang="ts">

const {
  themeColor,
  themeColorLight,
  themeColorDark,
  micIndicator,
  micIndicatorMax,
  micIndicatorMin,
  isMicTest,
  isNoiseSuppression,
  isExtendsMic,
  isJoining,
  phoneLevel,
  phoneMax,
  phoneMin,
  micLevel,
  micMax,
  micMin,
  micIndicatorColor,
  audioInputs,
  audioOutputs,
  selectedInput,
  selectedOutput,
  media
} = useComponents();

const { startListening, stopListening } = useMicIndicator();

const changePhoneVolume = () => {
  if (phoneLevel.value > phoneMax.value) {
    phoneLevel.value = phoneMax.value;
  } else if (phoneLevel.value < phoneMin.value) {
    phoneLevel.value = phoneMin.value;
  }
}
const changeMicVolume = () => {
  if (micLevel.value > micMax.value) {
    micLevel.value = micMax.value;
  } else if (micLevel.value < micMin.value) {
    micLevel.value = micMin.value;
  }

}

const clickExtendsMic = () => {
  isExtendsMic.value = !isExtendsMic.value

  if (isExtendsMic.value) {
    micMax.value = 2000;
  } else {
    micMax.value = 200;
    if (micLevel.value > 200) {
      micLevel.value = 200;
    }
  }
}

const toggleMicTest = async () => {
  isMicTest.value = !isMicTest.value;
  if (isMicTest.value) {
    await startListening();
  } else {
    stopListening();
  }
}

const toggleNoiseSuppression = () => {
  useNoiseSuppression();
}

watch(selectedInput, async () => {
  await useChangeMicMedia(isMicTest.value);
})

watch(phoneLevel, async () => {
  localStorage.setItem('phoneLevel', phoneLevel.value.toString());
})

</script>

<template>
  <v-list>
    <v-row justify="center" no-gutters>
      <v-col cols="12" sm="6" md="4" lg="3" xl="3">
        <v-list-item>
          <v-list-item-subtitle>入力デバイス<span v-show="isJoining" class="text-red ml-4">※入室後は変更できません</span></v-list-item-subtitle>
          <v-select :disabled="isJoining" v-model="selectedInput" :items="audioInputs" item-value="label" item-title="label" return-object variant="outlined"></v-select>
        </v-list-item>
        <v-list-item>
          <v-list-item-subtitle>
            入力音量
            <span @click="clickExtendsMic" style="cursor: pointer;" class="ml-10">
              上限拡張
              <v-icon :color="isExtendsMic ? 'red' : ''">
                {{ isExtendsMic ? 'mdi-lock-open-variant' : 'mdi-lock' }}
              </v-icon>
            </span>
          </v-list-item-subtitle>
          <v-slider v-model="micLevel" :color="themeColorLight(2).value" :min="micMin" :max="micMax" :step="0.1"
            style="padding-left: 15px;">
            <template #append>
              <v-text-field @input="changeMicVolume" v-model="micLevel" density="compact" style="width: 100px"
                type="number" hide-details single-line></v-text-field>
            </template>
          </v-slider>
        </v-list-item>
      </v-col>
      <v-col cols="12" sm="6" md="4" lg="3" xl="3">
        <v-list-item>
          <v-list-item-subtitle>出力デバイス<span class="text-red ml-4">※変更不可</span></v-list-item-subtitle>
          <v-select disabled v-model="selectedOutput" :items="audioOutputs" item-value="label" item-title="label" :readonly="true" variant="outlined"></v-select>
        </v-list-item>
        <v-list-item>
          <v-list-item-subtitle>出力音量</v-list-item-subtitle>
          <v-slider v-model="phoneLevel" :color="themeColorLight(2).value" :min="phoneMin" :max="phoneMax" :step="0.1"
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
      <v-col cols="12" sm="10" md="7" lg="5" xl="5">
        <v-list-item>
          <v-list-item-subtitle>マイクテスト</v-list-item-subtitle>
          <v-switch @change="toggleNoiseSuppression" v-model="isNoiseSuppression" :color="themeColor" label="ノイズ抑制" inset class="ml-4"/>
          <v-slider v-model="micIndicator" :min="micIndicatorMin" :max="micIndicatorMax" :color="micIndicatorColor"
            thumb-size="none" readonly>
            <template #prepend>
              <v-btn @click="toggleMicTest" :color="isMicTest ? themeColorLight(3).value : '#ddd'" width="100">
                {{ isMicTest ? 'テスト中' : 'テスト' }}
                <v-icon @click="isMicTest = !isMicTest" :color="isMicTest ? '' : 'red'">
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