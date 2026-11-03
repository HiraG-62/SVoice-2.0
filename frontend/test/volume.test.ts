import { describe, expect, it } from 'vitest';
import type { PlayerData } from '@svoice/shared';
import defaults from '../settings/default.json';
import { calcPlayerVolume, evaluatePlayerVolume, getDistance, shouldSubscribe } from '../services/volume';

type PlayerOverrides = Omit<Partial<PlayerData>, 'location' | 'transceiver' | 'radio' | 'voiceOptions'> & {
  location?: Omit<Partial<PlayerData['location']>, 'coordinates'> & { coordinates?: Partial<PlayerData['location']['coordinates']> };
  transceiver?: Partial<PlayerData['transceiver']>;
  radio?: Partial<PlayerData['radio']>;
  voiceOptions?: Partial<PlayerData['voiceOptions']>;
};
const player = (name: string, extra: PlayerOverrides = {}): PlayerData => ({
  name, telephone: 0, hasTelephone: 0, useMegaphone: 0, useMicrophone: 0, mute: 0, music: 0, ...extra,
  location: { server: 1, dimension: 0, ...extra.location, coordinates: { x: 0, y: 64, z: 0, ...extra.location?.coordinates } },
  transceiver: { type: 0, number: 0, ...extra.transceiver },
  radio: { type: 2, number: 0, ...extra.radio },
  voiceOptions: { rangeOutput: 100, volumeOutput: 100, rangeInput: 100, volumeInput: 100, ...extra.voiceOptions },
});

describe('新しい聞こえ方と判定理由', () => {
  const evaluate = (self: PlayerOverrides, other: PlayerOverrides, admin = false) => {
    const me = player('Alice', self), bob = player('Bob', other);
    return evaluatePlayerVolume(me, bob, getDistance(me, [me, bob]).get('Bob')!, defaults, admin);
  };
  const links: [string, PlayerOverrides, PlayerOverrides][] = [
    ['距離', {}, {}],
    ['電話', { telephone: 5 }, { telephone: 5 }],
    ['トランシーバー', { transceiver: { type: 0, number: 5 } }, { transceiver: { type: 1, number: 5 } }],
    ['ラジオ', { radio: { type: 0, number: 5 } }, { radio: { type: 1, number: 5 } }],
  ];
  it.each(links)('サーバー違いは%sでも聞こえない', (_, self, other) => {
    expect(evaluate({ ...self, location: { server: 2 } }, other)).toEqual({ volume: 0, reason: 'server' });
    expect(evaluate({ ...self, location: { server: 2 } }, other, true)).toEqual({ volume: 1, reason: 'admin' });
  });
  it.each(links)('音楽ミュートは%sでも聞こえない', (_, self, other) => {
    expect(evaluate({ ...self, music: 2 }, { ...other, music: 1 })).toEqual({ volume: 0, reason: 'music' });
    expect(evaluate({ ...self, music: 2 }, { ...other, music: 1 }, true)).toEqual({ volume: 1, reason: 'admin' });
  });
  it.each([[2, 0], [2, 2], [0, 1], [1, 1]])('音楽 L=%s S=%s は通常の判定', (listener, speaker) => {
    expect(evaluate({ music: listener }, { music: speaker })).toEqual({ volume: 1, reason: 'distance' });
  });
  it.each([
    [0, 1, 5, 5, 1], [1, 1, 5, 5, 0], [0, 1, 5, 6, 0],
    [2, 1, 5, 5, 0], [0, 2, 5, 5, 0], [1, 0, 5, 5, 0],
    [0, 1, 0, 0, 1],
  ])('ラジオ L=%s S=%s チャンネル %s/%s', (listener, speaker, lNumber, sNumber, volume) => {
    expect(evaluate({ radio: { type: listener, number: lNumber } }, {
      radio: { type: speaker, number: sNumber }, location: { dimension: 1, coordinates: { x: 1000 } },
    })).toEqual({ volume, reason: volume ? 'radio' : 'dimension' });
  });
  it.each([[-1, 0], [0, -1], [-1, -1]])('ディメンション %s/%s では距離の声が聞こえない', (listener, speaker) => {
    expect(evaluate({ location: { dimension: listener } }, { location: { dimension: speaker } }))
      .toEqual({ volume: 0, reason: 'dimension' });
  });
  it.each(links.slice(1))('ディメンション -1 でも%sは聞こえる', (_, self, other) => {
    expect(evaluate({ ...self, location: { dimension: -1 } }, { ...other, location: { dimension: -1 } }).volume).toBe(1);
  });
  it('ディメンション -1 でも全体発言は聞こえる', () => {
    expect(evaluate({ location: { dimension: -1 } }, { location: { dimension: -1 } }, true))
      .toEqual({ volume: 1, reason: 'admin' });
  });
  it.each([[2, 1], [0, 2], [1, 2]])('トランシーバー type %s/%s は持っていない', (listener, speaker) => {
    expect(evaluate({ transceiver: { type: listener, number: 5 } }, {
      transceiver: { type: speaker, number: 5 }, location: { coordinates: { x: 1000 } },
    })).toEqual({ volume: 0, reason: 'distance' });
  });
  it('ゲーム外では全体発言だけが聞こえる', () => {
    const bob = player('Bob');
    expect(evaluatePlayerVolume(undefined, bob, 0, defaults)).toEqual({ volume: 0, reason: 'offGame' });
    expect(evaluatePlayerVolume(undefined, undefined, 0, defaults, true)).toEqual({ volume: 1, reason: 'admin' });
  });
  it('最初に確定した手順を理由にする', () => {
    expect(evaluate({ telephone: 5 }, { telephone: 5 })).toEqual({ volume: 1, reason: 'phone' });
    expect(evaluate({ transceiver: { type: 0, number: 1 }, radio: { type: 0, number: 1 } }, {
      transceiver: { type: 1, number: 1 }, radio: { type: 1, number: 1 },
    })).toEqual({ volume: 1, reason: 'transceiver' });
    expect(evaluate({ location: { server: 2 }, music: 2 }, { music: 1 })).toEqual({ volume: 0, reason: 'server' });
  });
  it('電話の周辺音量係数はラジオにかからない', () => {
    expect(evaluate({ telephone: 1, radio: { type: 0, number: 5 } }, { radio: { type: 1, number: 5 } }))
      .toEqual({ volume: 1, reason: 'radio' });
  });
  it.each([[1, 1, 5, 5], [0, 1, 5, 6], [2, 1, 5, 5]])('ラジオでつながらなくても距離の声は聞こえる: %s/%s %s/%s', (listener, speaker, lNumber, sNumber) => {
    expect(evaluate({ radio: { type: listener, number: lNumber } }, { radio: { type: speaker, number: sNumber } }))
      .toEqual({ volume: 1, reason: 'distance' });
  });
  it('プレイヤーごとの係数を使い回さない', () => {
    const me = player('Alice', { telephone: 1 });
    const players = [me, player('Bob', { useMicrophone: 1 }), player('Charlie')];
    expect([...calcPlayerVolume(me, getDistance(me, players), players, defaults)])
      .toEqual([['Bob', 1.1], ['Charlie', .5]]);
  });
});
const cases: [string, PlayerOverrides, PlayerOverrides, number][] = [
  ['同位置', {}, {}, 1], ['距離3', {}, {location:{coordinates:{x:3}}}, 1], ['最小境界', {}, {location:{coordinates:{x:5}}}, 1],
  ['距離12', {}, {location:{coordinates:{x:12}}}, 8/15], ['最大境界', {}, {location:{coordinates:{x:20}}}, 0], ['距離25', {}, {location:{coordinates:{x:25}}}, 0],
  ['ディメンション', {}, {location:{dimension:1}}, 0],
  ['同じ通話は距離無視', {telephone:1}, {telephone:1,location:{coordinates:{x:100}}}, 1],
  ['同じ通話はディメンション無視', {telephone:1}, {telephone:1,location:{dimension:1}}, 1],
  ['自分だけ通話', {telephone:1}, {}, .5], ['相手だけ通話', {}, {telephone:1}, .5],
  ['別番号', {telephone:1}, {telephone:2}, .5],
  ['トランシーバー受信', {transceiver:{number:1}}, {location:{coordinates:{x:100}},transceiver:{number:1,type:1}}, 1],
  ['送信者同士', {transceiver:{number:1,type:1}}, {location:{dimension:1},transceiver:{number:1,type:1}}, 1],
  ['番号不一致', {transceiver:{number:1}}, {location:{coordinates:{x:100}},transceiver:{number:2,type:1}}, 0],
  ['受信側同士', {transceiver:{number:1}}, {location:{coordinates:{x:100}},transceiver:{number:1}}, 0],
  ['未所持', {}, {location:{coordinates:{x:100}},transceiver:{number:1,type:1}}, 0],
  ['対象外type', {transceiver:{number:1,type:2}}, {location:{coordinates:{x:100}},transceiver:{number:1,type:1}}, 0],
  ['マイク', {}, {useMicrophone:1,location:{coordinates:{x:10}}}, 1.1],
  ['マイクの最大境界', {}, {useMicrophone:1,location:{coordinates:{x:40}}}, 0],
  ['メガホン', {}, {useMegaphone:1,location:{coordinates:{x:25}}}, 1.1*5/22.5],
  ['マイク優先', {}, {useMicrophone:1,useMegaphone:1,location:{coordinates:{x:10}}}, 1.1],
  ['マイクが通話係数を上書き', {telephone:1}, {useMicrophone:1}, 1.1],
  ['メガホンが通話係数を上書き', {telephone:1}, {useMegaphone:1}, 1.1],
  ['相手の範囲', {}, {location:{coordinates:{x:20}},voiceOptions:{rangeOutput:200}}, 2/3],
  ['自分の範囲', {voiceOptions:{rangeInput:200}}, {location:{coordinates:{x:20}}}, 2/3],
  ['範囲の積', {voiceOptions:{rangeInput:200}}, {location:{coordinates:{x:12}},voiceOptions:{rangeOutput:50}}, 8/15],
  ['相手の音量', {}, {voiceOptions:{volumeOutput:50}}, .5],
  ['自分の音量', {voiceOptions:{volumeInput:50}}, {}, .5],
  ['音量の積', {voiceOptions:{volumeInput:50}}, {voiceOptions:{volumeOutput:50}}, .25],
  ['通話の倍率無視', {telephone:1,voiceOptions:{volumeInput:0}}, {telephone:1,voiceOptions:{volumeOutput:0}}, 1],
  ['音量0', {}, {voiceOptions:{volumeOutput:0}}, 0], ['範囲0', {}, {location:{coordinates:{x:1}},voiceOptions:{rangeOutput:0}}, 0],
];
describe('既存の聞こえ方 I1', () => {
  it.each(cases)('%s', (_, self, other, expected) => {
    const me = player('Alice', self), bob = player('Bob', other), players = [me,bob];
    expect(calcPlayerVolume(me,getDistance(me,players),players,defaults).get('Bob')).toBeCloseTo(expected,12);
  });
  it('三次元距離と自分の除外', () => {
    const me=player('Alice'), bob=player('Bob',{location:{coordinates:{x:3,y:68,z:12}}});
    expect([...getDistance(me,[me,bob])]).toEqual([['Bob',13]]);
  });
  it('最小音量は最大距離以降だけに適用', () => {
    const settings=structuredClone(defaults); settings.general.value.minVolume.value=.2;
    const me=player('Alice'), bob=player('Bob',{location:{coordinates:{x:20}}});
    expect(calcPlayerVolume(me,getDistance(me,[me,bob]),[me,bob],settings).get('Bob')).toBe(.2);
    bob.location.coordinates.x=19;
    expect(calcPlayerVolume(me,getDistance(me,[me,bob]),[me,bob],settings).get('Bob')).toBeCloseTo(1/15);
  });
  it.each([
    [true,false,1,true], [true,false,0,false], [true,true,0,true],
    [false,false,1,false], [false,true,0,true], [false,false,0,false],
  ])('受信判定 %s %s %s', (inGame,speaker,volume,expected) => {
    expect(shouldSubscribe(inGame,speaker,volume)).toBe(expected);
  });
});
