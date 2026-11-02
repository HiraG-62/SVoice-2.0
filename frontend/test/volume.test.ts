import { describe, expect, it } from 'vitest';
import type { PlayerData } from '@svoice/shared';
import defaults from '../settings/default.json';
import { calcPlayerVolume, getDistance, shouldSubscribe } from '../services/volume';

const player = (name: string, extra: Partial<PlayerData> = {}): PlayerData => ({
  name, dimension: 0, x: 0, y: 64, z: 0, telephone: 0, hasTelephone: 0,
  useMegaphone: 0, useMicrophone: 0, transceiverType: 0, transceiverNumber: 0, mute: 0,
  voiceRangeOutput: 100, volumeOutput: 100, voiceRangeInput: 100, volumeInput: 100, ...extra,
});
const cases: [string, Partial<PlayerData>, Partial<PlayerData>, number][] = [
  ['同位置', {}, {}, 1], ['距離3', {}, {x:3}, 1], ['最小境界', {}, {x:5}, 1],
  ['距離12', {}, {x:12}, 8/15], ['最大境界', {}, {x:20}, 0], ['距離25', {}, {x:25}, 0],
  ['ディメンション', {}, {dimension:1}, 0],
  ['同じ通話は距離無視', {telephone:1}, {telephone:1,x:100}, 1],
  ['同じ通話はディメンション無視', {telephone:1}, {telephone:1,dimension:1}, 1],
  ['自分だけ通話', {telephone:1}, {}, .5], ['相手だけ通話', {}, {telephone:1}, .5],
  ['別番号', {telephone:1}, {telephone:2}, .5],
  ['トランシーバー受信', {transceiverNumber:1}, {transceiverNumber:1,transceiverType:1,x:100}, 1],
  ['送信者同士', {transceiverNumber:1,transceiverType:1}, {transceiverNumber:1,transceiverType:1,dimension:1}, 1],
  ['番号不一致', {transceiverNumber:1}, {transceiverNumber:2,transceiverType:1,x:100}, 0],
  ['受信側同士', {transceiverNumber:1}, {transceiverNumber:1,x:100}, 0],
  ['未所持', {}, {transceiverNumber:1,transceiverType:1,x:100}, 0],
  ['対象外type', {transceiverNumber:1,transceiverType:2}, {transceiverNumber:1,transceiverType:1,x:100}, 0],
  ['マイク', {}, {useMicrophone:1,x:10}, 1.1],
  ['マイクの最大境界', {}, {useMicrophone:1,x:40}, 0],
  ['メガホン', {}, {useMegaphone:1,x:25}, 1.1*5/22.5],
  ['マイク優先', {}, {useMicrophone:1,useMegaphone:1,x:10}, 1.1],
  ['マイクが通話係数を上書き', {telephone:1}, {useMicrophone:1}, 1.1],
  ['メガホンが通話係数を上書き', {telephone:1}, {useMegaphone:1}, 1.1],
  ['相手の範囲', {}, {voiceRangeOutput:200,x:20}, 2/3],
  ['自分の範囲', {voiceRangeInput:200}, {x:20}, 2/3],
  ['範囲の積', {voiceRangeInput:200}, {voiceRangeOutput:50,x:12}, 8/15],
  ['相手の音量', {}, {volumeOutput:50}, .5],
  ['自分の音量', {volumeInput:50}, {}, .5],
  ['音量の積', {volumeInput:50}, {volumeOutput:50}, .25],
  ['通話の倍率無視', {telephone:1,volumeInput:0}, {telephone:1,volumeOutput:0}, 1],
  ['音量0', {}, {volumeOutput:0}, 0], ['範囲0', {}, {voiceRangeOutput:0,x:1}, 0],
];
describe('既存の聞こえ方 I1', () => {
  it.each(cases)('%s', (_, self, other, expected) => {
    const me = player('Alice', self), bob = player('Bob', other), players = [me,bob];
    expect(calcPlayerVolume(me,getDistance(me,players),players,defaults).get('Bob')).toBeCloseTo(expected,12);
  });
  it('三次元距離と自分の除外', () => {
    const me=player('Alice'), bob=player('Bob',{x:3,y:68,z:12});
    expect([...getDistance(me,[me,bob])]).toEqual([['Bob',13]]);
  });
  it('最小音量は最大距離以降だけに適用', () => {
    const settings=structuredClone(defaults); settings.general.value.minVolume.value=.2;
    const me=player('Alice'), bob=player('Bob',{x:20});
    expect(calcPlayerVolume(me,getDistance(me,[me,bob]),[me,bob],settings).get('Bob')).toBe(.2);
    bob.x=19;
    expect(calcPlayerVolume(me,getDistance(me,[me,bob]),[me,bob],settings).get('Bob')).toBeCloseTo(1/15);
  });
  it.each([
    [true,false,1,true], [true,false,0,false], [true,true,0,true],
    [false,false,1,false], [false,true,0,true], [false,false,0,false],
  ])('受信判定 %s %s %s', (inGame,speaker,volume,expected) => {
    expect(shouldSubscribe(inGame,speaker,volume)).toBe(expected);
  });
});
