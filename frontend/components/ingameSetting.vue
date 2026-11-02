<script setup lang="ts">
import { useDisplay } from 'vuetify';
import { useSettingsStore } from '../stores/settings';

const { mdAndUp, smAndDown } = useDisplay();

const { themeColorLight } = useThemeColor();
const settings = useSettingsStore();
const ingameSettings = ref(settings.value ? structuredClone(toRaw(settings.value)) : null);
watch(() => settings.value, value => { ingameSettings.value = value ? structuredClone(toRaw(value)) : null; });

const containerStyle = computed(() => {
  if (mdAndUp.value) {
    return { width: '60%' }
  } else if (smAndDown.value) {
    return { width: '90%' }
  } else {
    return { width: '80%' }
  }
})

const setSettings = async () => {
  settings.replace(ingameSettings.value ? structuredClone(toRaw(ingameSettings.value)) : null);
  await settings.save();
  useSetSettingSocket();
}

const getDefaultSettings = async () => {
  await settings.defaults();
}

</script>

<template>
  <v-container :style="containerStyle" class="mx-auto">
    <v-row>
      <v-col cols="5" sm="4" md="3" lg="3" xl="3">
        <v-btn @click="setSettings" class="mb-4" color="green">変更確定</v-btn>
      </v-col>
      <v-spacer></v-spacer>
      <v-col cols="7" sm="4" md="4" lg="4" xl="4">
        <v-btn @click="getDefaultSettings" class="mb-4" color="red">デフォルトに戻す</v-btn>
      </v-col>
    </v-row>
    <v-row v-for="(option, key) in ingameSettings" :key="key" no-gutters>
      <v-col cols="12" class="font-weight-bold text-left">{{ option.label }}</v-col>

      <v-col cols="12">
        <v-list>
          <v-list-item v-for="(setting, settingKey) in option.value" :key="settingKey">
            <v-list-item-subtitle>{{ setting.label }}</v-list-item-subtitle>
            <v-list-item-action>
              <v-slider v-model="setting.value" :color="themeColorLight(2)" :min="setting.min" :max="setting.max"
                :step="setting.step" style="padding: 5px 15px" class="align-center" hide-details>
                <template #prepend>
                  <span style="width: 50px">{{ setting.value }}</span>
                </template>
              </v-slider>
            </v-list-item-action>
          </v-list-item>
        </v-list>
      </v-col>
    </v-row>
  </v-container>
</template>
