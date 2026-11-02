import type { IngameSettings, PlayerData } from '@svoice/shared';
import { PERCENT } from './constants';

export const getDistance = (selfData: PlayerData, players: PlayerData[]) => {
  const distanceMap = new Map<string, number>();

  players.forEach((data) => {
    if (!selfData || data.name == selfData.name) return;

    const distance = Math.sqrt(Math.pow((selfData.x - data.x), 2) + Math.pow((selfData.y - data.y), 2) + Math.pow((selfData.z - data.z), 2));
    distanceMap.set(data.name, distance);
  })

  return distanceMap;
}

export const calcPlayerVolume = (selfData: PlayerData, distanceData: Map<string, number>, players: PlayerData[], option: IngameSettings) => {

  const playerVolume = new Map<string, number>();

  let min: number;
  let max: number;
  let coef = 1;
  let range = 1;
  let volume = 1;
  let distanceVolume = 0;

  const calc = (oppName: string) => {
    const oppData = players.find(player => player.name == oppName)!;
    const oppDistance = distanceData.get(oppName)!;

    if (oppData == undefined || selfData == undefined) return 0;

    if (selfData.telephone + oppData.telephone == 0) coef = 1;
    else if ((selfData.telephone == oppData.telephone)) return 1;
    else if ((selfData.telephone != oppData.telephone)) coef = option.general.value.callingVolume.value;

    if (selfData.transceiverNumber >= 1 && oppData.transceiverNumber >= 1) {
      if (oppData.transceiverType === 1 && oppData.transceiverNumber == selfData.transceiverNumber &&
        (selfData.transceiverType === 0 || selfData.transceiverType === 1)) {
        return 1;
      }
    }

    if (selfData.dimension != oppData.dimension) return 0;

    if (oppData.useMicrophone) {
      coef = option.microphone.value.volumeGain.value;
      min = option.microphone.value.minDistance.value;
      max = option.microphone.value.maxDistance.value;
    } else if (oppData.useMegaphone) {
      coef = option.megaphone.value.volumeGain.value;
      min = option.megaphone.value.minDistance.value;
      max = option.megaphone.value.maxDistance.value;
    } else {
      min = option.general.value.minDistance.value;
      max = option.general.value.maxDistance.value;
    }

    range = (oppData.voiceRangeOutput / PERCENT) * (selfData.voiceRangeInput / PERCENT);
    volume = (oppData.volumeOutput / PERCENT) * (selfData.volumeInput / PERCENT);

    max *= range;
    min *= range;

    if (oppDistance <= min) distanceVolume = 1;
    else if (oppDistance >= max) distanceVolume = option.general.value.minVolume.value;
    else distanceVolume = (1 - (oppDistance - min) / (max - min));

    return distanceVolume * coef * volume;
  }

  players.forEach(player => {
    if (selfData == undefined) {
      playerVolume.set(player.name, 0);
      return;
    }
    if (player.name == selfData.name) return;

    playerVolume.set(player.name, calc(player.name));
  })

  return playerVolume;
}

export function shouldSubscribe(inGame: boolean, speaker: boolean, volume: number) {
  return speaker || (inGame && volume > 0);
}
