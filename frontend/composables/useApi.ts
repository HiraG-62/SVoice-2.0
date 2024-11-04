export async function getIngameSettings() {
  const { ingameSettings } = useComponents();

  const { data, error } = await useFetch('/api/getSetting');
  ingameSettings.value = data.value;
}

export async function setIngameSettings() {
  const { ingameSettings } = useComponents();

  const { data, error } = await useFetch('/api/setSetting', {
    method: 'POST',
    body: ingameSettings.value
  })
}

export async function getIngameDefaultSettings() {
  const { ingameSettings } = useComponents();

  const { data, error } = await useFetch('/api/getDefaultSetting');
  ingameSettings.value = data.value;
}