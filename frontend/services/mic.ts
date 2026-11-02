import { ANALYSER_FFT_SIZE, DEFAULT_LEVEL, micGain } from './constants';

export function createMicService(workletUrl: string, workletName: string) {
  let context: AudioContext | undefined;
  let media: MediaStream | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let gain: GainNode | undefined;
  let noise: AudioWorkletNode | undefined;
  let destination: MediaStreamAudioDestinationNode | undefined;
  let preparing: Promise<void> | undefined;
  let testCleanup: (() => void) | undefined;
  let generation = 0;
  let inputRequest = 0;
  let settings = { level: DEFAULT_LEVEL, muted: false, noiseSuppression: true };

  function connect() {
    if (!source || !gain || !noise) return;
    source.disconnect();
    noise.disconnect();
    if (settings.noiseSuppression) {
      source.connect(noise);
      noise.connect(gain);
    }
    else source.connect(gain);
  }

  async function changeInput(deviceId?: string) {
    const current = ++inputRequest;
    const next = await navigator.mediaDevices.getUserMedia({ video: false, audio: {
      echoCancellation: false, noiseSuppression: true, ...(deviceId ? { deviceId } : {}),
    } });
    if (current !== inputRequest || !context) {
      next.getTracks().forEach(track => track.stop());
      return;
    }
    const nextSource = context.createMediaStreamSource(next);
    source?.disconnect();
    media?.getTracks().forEach(track => track.stop());
    media = next;
    source = nextSource;
    connect();
  }

  async function prepare() {
    if (preparing) return preparing;
    if (destination && media) { await context?.resume(); return; }
    const current = generation;
    const request = (async () => {
      const audioContext = new AudioContext();
      context = audioContext;
      await audioContext.audioWorklet.addModule(workletUrl);
      if (current !== generation) return;
      noise = new AudioWorkletNode(audioContext, workletName);
      gain = audioContext.createGain();
      destination = audioContext.createMediaStreamDestination();
      gain.connect(destination);
      gain.gain.value = micGain(settings.level, settings.muted);
      await changeInput();
      if (current !== generation) return;
      await audioContext.resume();
    })();
    preparing = request;
    try { await request; } catch (error) { if (current === generation) await dispose(); throw error; }
    finally { if (preparing === request) preparing = undefined; }
  }

  function update(next: typeof settings) {
    const changed = settings.noiseSuppression !== next.noiseSuppression;
    settings = { ...next };
    if (gain) gain.gain.value = micGain(settings.level, settings.muted);
    if (changed) connect();
  }

  function stopTest() { testCleanup?.(); testCleanup = undefined; }

  function startTest(indicator: (value: number) => void) {
    if (!context || !gain || !media) return false;
    stopTest();
    const audioContext = context, micNode = gain;
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = ANALYSER_FFT_SIZE;
    const samples = new Uint8Array(analyser.frequencyBinCount);
    micNode.connect(analyser);
    micNode.connect(audioContext.destination);
    let frame = 0;
    const tick = () => {
      analyser.getByteFrequencyData(samples);
      indicator(Math.min(samples.reduce((sum, value) => sum + value, 0) / samples.length, DEFAULT_LEVEL));
      frame = requestAnimationFrame(tick);
    };
    testCleanup = () => {
      cancelAnimationFrame(frame);
      micNode.disconnect(analyser);
      micNode.disconnect(audioContext.destination);
      analyser.disconnect();
      indicator(0);
    };
    tick();
    return true;
  }

  async function dispose() {
    generation++;
    inputRequest++;
    preparing = undefined;
    stopTest();
    source?.disconnect();
    noise?.disconnect();
    gain?.disconnect();
    destination?.disconnect();
    media?.getTracks().forEach(track => track.stop());
    destination?.stream.getTracks().forEach(track => track.stop());
    const old = context;
    context = undefined; source = undefined; noise = undefined; gain = undefined;
    media = undefined; destination = undefined;
    if (old && old.state !== 'closed') await old.close();
  }

  return { prepare, changeInput, update, startTest, stopTest, dispose,
    get context() { return context; }, get destination() { return destination; },
    get media() { return media; }, get ready() { return !!(media && gain && destination); },
    get currentGain() { return gain?.gain.value ?? 0; },
  };
}
