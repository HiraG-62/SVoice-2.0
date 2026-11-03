import type { IngameSettings, PlayerData } from '@svoice/shared';
import { PERCENT } from './constants';

const DEVICE_RECEIVE = 0;
const DEVICE_SEND = 1;
const MUSIC_MUTE = 2;
const MUSIC_ON = 1;
const OTHER_DIMENSION = -1;
const MIN_TRANSCEIVER_CHANNEL = 1;

export type VolumeReason = 'admin' | 'offGame' | 'server' | 'music' | 'phone' | 'transceiver' | 'radio' | 'dimension' | 'distance' | 'settingsMissing';
export interface VolumeDecision { volume: number; reason: VolumeReason }

export function getDistance(selfData: PlayerData, players: PlayerData[]) {
  const distanceMap = new Map<string, number>();
  const self = selfData.location.coordinates;
  for (const player of players) {
    if (player.name === selfData.name) continue;
    const other = player.location.coordinates;
    distanceMap.set(player.name, Math.sqrt((self.x - other.x) ** 2 + (self.y - other.y) ** 2 + (self.z - other.z) ** 2));
  }
  return distanceMap;
}

function distanceVolume(self: PlayerData, other: PlayerData, distance: number, settings: IngameSettings) {
  const device = other.useMicrophone ? settings.microphone : other.useMegaphone ? settings.megaphone : undefined;
  const coefficient = device ? device.value.volumeGain.value
    : self.telephone === 0 && other.telephone === 0 ? 1 : settings.general.value.callingVolume.value;
  const limits = device?.value ?? settings.general.value;
  const range = (other.voiceOptions.rangeOutput / PERCENT) * (self.voiceOptions.rangeInput / PERCENT);
  const volume = (other.voiceOptions.volumeOutput / PERCENT) * (self.voiceOptions.volumeInput / PERCENT);
  const min = limits.minDistance.value * range;
  const max = limits.maxDistance.value * range;
  const attenuation = distance <= min ? 1 : distance >= max ? settings.general.value.minVolume.value
    : 1 - (distance - min) / (max - min);
  return attenuation * coefficient * volume;
}

export function evaluatePlayerVolume(
  self: PlayerData | undefined, other: PlayerData | undefined, distance: number,
  settings: IngameSettings | null, admin = false,
): VolumeDecision {
  if (admin) return { volume: 1, reason: 'admin' };
  if (!self || !other) return { volume: 0, reason: 'offGame' };
  if (self.location.server !== other.location.server) return { volume: 0, reason: 'server' };
  if (self.music === MUSIC_MUTE && other.music === MUSIC_ON) return { volume: 0, reason: 'music' };
  if (self.telephone !== 0 && other.telephone !== 0 && self.telephone === other.telephone) return { volume: 1, reason: 'phone' };
  if (other.transceiver.type === DEVICE_SEND &&
    (self.transceiver.type === DEVICE_RECEIVE || self.transceiver.type === DEVICE_SEND) &&
    self.transceiver.number >= MIN_TRANSCEIVER_CHANNEL && other.transceiver.number >= MIN_TRANSCEIVER_CHANNEL &&
    self.transceiver.number === other.transceiver.number) return { volume: 1, reason: 'transceiver' };
  if (other.radio.type === DEVICE_SEND && self.radio.type === DEVICE_RECEIVE &&
    self.radio.number === other.radio.number) return { volume: 1, reason: 'radio' };
  if (self.location.dimension !== other.location.dimension ||
    self.location.dimension === OTHER_DIMENSION || other.location.dimension === OTHER_DIMENSION) return { volume: 0, reason: 'dimension' };
  if (!settings) return { volume: 0, reason: 'settingsMissing' };
  return { volume: distanceVolume(self, other, distance, settings), reason: 'distance' };
}

export function calcPlayerVolume(self: PlayerData, distances: Map<string, number>, players: PlayerData[], settings: IngameSettings) {
  const volumes = new Map<string, number>();
  for (const player of players) {
    if (player.name === self?.name) continue;
    volumes.set(player.name, evaluatePlayerVolume(self, player, distances.get(player.name)!, settings).volume);
  }
  return volumes;
}

export function shouldSubscribe(inGame: boolean, speaker: boolean, volume: number) {
  return speaker || (inGame && volume > 0);
}
