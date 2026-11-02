const getSocketSession = () => useNuxtApp().$voiceSocket;
export function useSetSettingSocket() { getSocketSession().changeSetting(); }
export function useOnAdminSpeaker() { getSocketSession().onSpeaker(); }
export function useOffAdminSpeaker() { getSocketSession().offSpeaker(); }
export function useKick(gamerTag: string) { getSocketSession().kick(gamerTag); }
