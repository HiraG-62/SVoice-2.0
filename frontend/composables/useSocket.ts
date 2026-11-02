const getSocketSession = () => useNuxtApp().$voiceSocket;

export function useConnectSocket() {
  return getSocketSession().join(useComponents().gamerTag.value);
}

export function useDisconnectSocket() { getSocketSession().leave(); }
export function useSetSettingSocket() { getSocketSession().changeSetting(); }
export function useOnAdminSpeaker() { getSocketSession().onSpeaker(); }
export function useOffAdminSpeaker() { getSocketSession().offSpeaker(); }
export function useKick(gamerTag: string) { getSocketSession().kick(gamerTag); }
export function useSendDebugSocket(data: unknown) { getSocketSession().debug(data); }
