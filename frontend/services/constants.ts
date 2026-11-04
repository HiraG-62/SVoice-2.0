export const DEFAULT_LEVEL = 100;
export const NORMAL_LEVEL_MAX = 200;
export const EXTENDED_LEVEL_MAX = 2000;
export const MIC_GAIN_DIVISOR = 50;
export const RECEIVE_GAIN_MULTIPLIER = 2;
export const PERCENT = 100;
export const SYNC_INTERVAL_MS = 100;
export const VOICE_INTERVAL_MS = 200;
export const ANALYSER_FFT_SIZE = 256;
export const NOISE_CHANNEL_COUNT = 1;
export const VOICE_CENTER = 128;
export const VOICE_THRESHOLD = 1;
export const MAX_PEER_GAIN = 2;
export const MAX_SUBSCRIBERS = 99;

export function micGain(level: number, muted: boolean) {
  return muted ? 0 : level / MIC_GAIN_DIVISOR;
}

export function receiveGain(peerGain: number, distanceVolume: number, outputLevel: number) {
  return RECEIVE_GAIN_MULTIPLIER * peerGain * distanceVolume * outputLevel / PERCENT;
}
