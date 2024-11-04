interface UserInfo {
  gamerTag: string;
  gain: number;
  voice: boolean;
  source: MediaStreamAudioSourceNode;
  gainNode: GainNode;
  destination: MediaStreamAudioDestinationNode;
  analyser: AnalyserNode;
  audio: HTMLAudioElement;
}