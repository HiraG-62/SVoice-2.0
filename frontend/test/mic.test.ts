import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMicService } from '../services/mic';

function setup() {
  const track = () => ({ stop: vi.fn() });
  const inputs = [track(), track()];
  let index = 0;
  const getUserMedia = vi.fn(async () => ({ getTracks: () => [inputs[index++]!], getAudioTracks: () => [] }));
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  const gain = { ...node(), gain: { value: 0 } };
  const destination = { ...node(), stream: { getTracks: () => [] } };
  const context = { createMediaStreamSource: vi.fn(node), createGain: () => gain,
    createMediaStreamDestination: vi.fn(() => destination), audioWorklet: { addModule: vi.fn() },
    close: vi.fn(), resume: vi.fn(), state: 'running' };
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  vi.stubGlobal('AudioContext', function () { return context; });
  const AudioWorkletNodeMock = vi.fn(function () { return node(); });
  vi.stubGlobal('AudioWorkletNode', AudioWorkletNodeMock);
  const mic = createMicService('worklet', 'noise');
  return { mic, context, gain, inputs, getUserMedia, AudioWorkletNodeMock };
}
afterEach(() => vi.unstubAllGlobals());
describe('マイクの寿命とミュート', () => {
  it('準備前はマイクテストを開始しない', () => {
    expect(setup().mic.startTest(() => {})).toBe(false);
  });
  it('ミュート中に音量を変えても gain は0', async () => {
    const { mic, gain } = setup();
    await mic.prepare();
    mic.update({ level: 100, muted: true, noiseSuppression: true });
    mic.update({ level: 200, muted: true, noiseSuppression: true });
    expect(gain.gain.value).toBe(0);
    mic.update({ level: 200, muted: false, noiseSuppression: true });
    expect(gain.gain.value).toBe(4);
  });
  it('入力変更で配信用destinationとworkletを作り直さず、旧トラックを停止する', async () => {
    const { mic, context, inputs, getUserMedia } = setup();
    await mic.prepare();
    const destination = mic.destination;
    await mic.changeInput('other');
    expect(mic.destination).toBe(destination);
    expect(context.createMediaStreamDestination).toHaveBeenCalledOnce();
    expect(context.audioWorklet.addModule).toHaveBeenCalledOnce();
    expect(inputs[0]!.stop).toHaveBeenCalledOnce();
    expect(getUserMedia).toHaveBeenLastCalledWith({ video: false, audio: {
      echoCancellation: false, noiseSuppression: true, deviceId: 'other',
    } });
    await mic.dispose();
    expect(inputs[1]!.stop).toHaveBeenCalledOnce();
  });
  it('ノイズ抑制の worklet は入出力をモノラルにする', async () => {
    const { mic, context, AudioWorkletNodeMock } = setup();
    await mic.prepare();
    expect(AudioWorkletNodeMock).toHaveBeenCalledWith(context, 'noise', {
      channelCount: 1, channelCountMode: 'explicit', channelInterpretation: 'speakers', outputChannelCount: [1],
    });
  });
  it('同時に準備してもマイクとworkletの準備を1回にする', async () => {
    const { mic, context, getUserMedia } = setup();
    await Promise.all([mic.prepare(), mic.prepare()]);
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(context.audioWorklet.addModule).toHaveBeenCalledOnce();
    expect(mic.ready).toBe(true);
  });
});
