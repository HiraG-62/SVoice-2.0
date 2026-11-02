import { getSettingStore } from '../utils/settingStore';

export default defineNitroPlugin(() => {
  getSettingStore(useRuntimeConfig().dataDir);
});
