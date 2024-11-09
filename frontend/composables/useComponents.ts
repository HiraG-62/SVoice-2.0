export function useComponents() {
  const themeColor = useState<string>('themeColor', () => 'teal');
  const themeColorLight = (num: number) => useState<string>('themeColorLight', () => `${themeColor.value}-lighten-${num}`);
  const themeColorDark = (num: number) => useState<string>('themeColorDark', () => `${themeColor.value}-darken-${num}`);

  const gamerTag = useState<string>('gamerTag', () => '');

  const micIndicator = useState<number>('micIndicator', () => 0);
  const micIndicatorMax = ref<number>(50);
  const micIndicatorMin = ref<number>(0);

  const isMicTest = ref<boolean>(false);
  const isSelfMute = useState<boolean>('isSelfMute', () => false);
  const isNoiseSuppression = useState<boolean>('isNoiseSuppression', () => true);
  const isExtendsMic = ref<boolean>(false);
  const isJoining = useState<boolean>('isJoining', () => false);
  const isJoiningIngame = useState<boolean>('isJoiningIngame', () => false);

  const phoneLevel = useState<number>('phoneLevel', () => 100);
  const phoneMax = ref<number>(200);
  const phoneMin = ref<number>(0);

  const micLevel = useState<number>('micLevel', () => 100);
  const micMax = ref<number>(200);
  const micMin = ref<number>(0);

  const micIndicatorColor = computed(() => sliderLevel(micIndicator.value, micIndicatorMax.value));
  const micLevelColor = computed(() => sliderLevel(micLevel.value, micMax.value));

  const audioInputs = useState<MediaDeviceInfo[]>('audioInputs', () => []);
  const audioOutputs = useState<MediaDeviceInfo[]>('audioOutputs', () => []);

  const selectedInput = useState<AudioDevice | null>('selectedInput', () => null);
  const selectedOutput = useState<AudioDevice | null>('selectedOutput', () => null);

  const microphone = useState<MediaStreamAudioSourceNode | null>('microphone', () => null);
  const media = useState<MediaStream | null>('media', () => null);
  const audioContext = useState<AudioContext | null>('audioContext', () => null);
  const micNode = useState<GainNode | null>('micNode', () => null);
  const noiseSupNode = useState<AudioWorkletNode | null>('noiseSupNode', () => null);
  const micDest = useState<MediaStreamAudioDestinationNode | null>('micDest', () => null);

  const userList = useState<JoinUserInfo[]>('userList', () => reactive([]));
  const nearbyUserList = useState<UserInfo[]>('nearbyUserList', () => reactive([]));

  const ingameSettings = useState<ingameSettings | null>('ingameSettings', () => null);
  const playerData = useState<playerData[]>('playerData', () => []);
  const isSpeaking = useState<boolean>('isSpeaking', () => false);
  const adminSpeaker = useState<Set<string>>('adminSpeaker', () => new Set());

  function sliderLevel(value: number, max: number) {
    if (value == 0) return 'grey'
    else if (value < max * 0.2) return 'indigo'
    else if (value < max * 0.4) return 'teal'
    else if (value < max * 0.6) return 'green'
    else if (value < max * 0.8) return 'orange'
    return 'red'
  }

  return {
    themeColor,
    themeColorLight,
    themeColorDark,
    gamerTag,
    micIndicator,
    micIndicatorMax,
    micIndicatorMin,
    isMicTest,
    isSelfMute,
    isNoiseSuppression,
    isExtendsMic,
    isJoining,
    isJoiningIngame,
    phoneLevel,
    phoneMax,
    phoneMin,
    micLevel,
    micMax,
    micMin,
    micIndicatorColor,
    micLevelColor,
    audioInputs,
    audioOutputs,
    selectedInput,
    selectedOutput,
    microphone,
    media,
    audioContext,
    micNode,
    noiseSupNode,
    micDest,
    userList,
    nearbyUserList,
    ingameSettings,
    playerData,
    isSpeaking,
    adminSpeaker
  }
}