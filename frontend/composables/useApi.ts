// どれも画面の表示後（onMounted・操作・Socket の受信）に呼ばれるため、useFetch ではなく $fetch を使う
export async function getIngameSettings() {
  const { ingameSettings } = useComponents();

  ingameSettings.value = await $fetch('/api/getSetting');
}

export async function setIngameSettings() {
  const { ingameSettings } = useComponents();

  await $fetch('/api/setSetting', {
    method: 'POST',
    body: ingameSettings.value
  })
}

export async function getIngameDefaultSettings() {
  const { ingameSettings } = useComponents();

  ingameSettings.value = await $fetch('/api/getDefaultSetting');
}
