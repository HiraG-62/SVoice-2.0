import { NoiseSuppressorWorklet_Name } from "@timephy/rnnoise-wasm"
import NoiseSuppressorWorklet from "@timephy/rnnoise-wasm/NoiseSuppressorWorklet?worker&url";

let isListening = false;

const createMicNode = async () => {
  const {
    isSelfMute,
    micLevel,
    phoneLevel,
    microphone,
    isNoiseSuppression,
    media,
    audioContext,
    micNode,
    noiseSupNode,
    micDest
  } = useComponents();

  await audioContext.value!.audioWorklet.addModule(NoiseSuppressorWorklet);

  microphone.value = audioContext.value!.createMediaStreamSource(media.value!);
  micNode.value = audioContext.value!.createGain();
  noiseSupNode.value = new AudioWorkletNode(audioContext.value!, NoiseSuppressorWorklet_Name);
  micDest.value = audioContext.value!.createMediaStreamDestination();

  micLevel.value = Number(localStorage.getItem('micLevel')) || 100;
  phoneLevel.value = Number(localStorage.getItem('phoneLevel')) || 100;

  micNode.value.gain.value = micLevel.value / 50 * (isSelfMute.value ? 0 : 1);

  watch(isSelfMute, (newMute) => {
    micNode.value!.gain.value = micLevel.value / 50 * (newMute ? 0 : 1);
  })

  if(isNoiseSuppression.value) {
    microphone.value.connect(noiseSupNode.value);
    noiseSupNode.value.connect(micNode.value);
  } else {
    microphone.value.connect(micNode.value);
  }
  micNode.value.connect(micDest.value);
}

export async function useAudio() {

  const {
    micLevel,
    media,
    audioContext,
    micNode
  } = useComponents();


  try {
    media.value = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: {
        echoCancellation: false,
        noiseSuppression: true,
      }
    });
    audioContext.value = new AudioContext();

    await createMicNode();
  } catch (err) {
    media.value = null;
    console.error('mic connection error: ', err);
  }

  watch(micLevel, (newVolume) => {
    if (micNode.value) {
      micNode.value.gain.value = newVolume / 50;
    }
    localStorage.setItem('micLevel', newVolume.toString());
  })
}

export function useNoiseSuppression() {
  const {
    isNoiseSuppression,
    microphone,
    micNode,
    noiseSupNode
  } = useComponents();

  if(isNoiseSuppression.value) {
    microphone.value!.disconnect(micNode.value!);
    microphone.value!.connect(noiseSupNode.value!);
    noiseSupNode.value!.connect(micNode.value!);
  } else {
    microphone.value!.disconnect(noiseSupNode.value!);
    noiseSupNode.value!.disconnect(micNode.value!);
    microphone.value!.connect(micNode.value!);
  }
}

export function useMicIndicator() {

  const {
    micLevel,
    micIndicator,
    isMicTest,
    selectedInput,
    media,
    audioContext,
    micNode
  } = useComponents();

  let analyser: AnalyserNode | null = null;
  let dataArray: Uint8Array | null = null;
  let animationFrameId: number | null = null;

  const startListening = async () => {
    if (micNode == null) {
      isMicTest.value = false;
      console.warn('not connecting microphone')
      return;
    }
    try {
      analyser = audioContext.value!.createAnalyser();
      micNode.value?.connect(analyser);
      micNode.value?.connect(audioContext.value!.destination);

      analyser.fftSize = 256;
      const bufferLength = analyser.frequencyBinCount;
      dataArray = new Uint8Array(bufferLength);

      const updateVolume = () => {
        analyser?.getByteFrequencyData(dataArray!);
        const sum = dataArray?.reduce((acc, val) => acc + val, 0) || 0;
        micIndicator.value = Math.min(Math.max(sum / bufferLength, 0), 100);
        animationFrameId = requestAnimationFrame(updateVolume);
        console.log(micIndicator.value)
      };

      updateVolume();
    } catch (err) {
      console.error('Error accessing microphone:', err);
    }
  };

  const stopListening = () => {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    if (audioContext.value) {
      analyser = null;
      try {
        micNode.value?.disconnect(audioContext.value.destination);
      } catch { };
    }
    micIndicator.value = 0;
  };

  watch(media, async (newMedia) => {
    if (analyser != null) {
      stopListening();

      await new Promise<void>((resolve) => {
        const checkListening = () => {
          if (isListening) {
            resolve();
          } else {
            // 少し待ってから再度チェック
            setTimeout(checkListening, 100);
          }
        };
        checkListening();
      });

      await startListening();
    }
  });

  onUnmounted(() => {
    stopListening();
  });

  return { startListening, stopListening };
}

export async function useAudioDevice() {
  const {
    audioInputs,
    audioOutputs,
    selectedInput,
    selectedOutput,
    media
  } = useComponents();

  const audioTrack = media.value?.getAudioTracks()[0];

  const devices = await navigator.mediaDevices.enumerateDevices();
  audioInputs.value = devices
    .filter(device =>
      device.kind === 'audioinput' &&
      device.deviceId !== 'default' &&
      device.deviceId !== 'communications'
    )
    .map(device => ({
      ...device,
      label: device.label || 'Unknown Microphone',
      deviceId: device.deviceId || 'Unknown Microphone'
    }) as AudioDevice);

  audioOutputs.value = devices
    .filter(device =>
      device.kind === 'audiooutput'
    )
    .map(device => ({
      ...device,
      label: device.label || 'Unknown Speaker',
      deviceId: device.deviceId || 'Unknown Speaker'
    }) as AudioDevice);

  selectedInput.value = audioInputs.value
    .find(device => device.deviceId === audioTrack?.getSettings().deviceId) as AudioDevice;

  selectedOutput.value = audioOutputs.value
    .find(device => device.deviceId === 'default') as AudioDevice;
}

export async function useChangeMicMedia(isMicTest: boolean) {
  const {
    selectedInput,
    media
  } = useComponents();

  const { startListening, stopListening } = useMicIndicator();

  const stopStream = () => {
    if (media.value) {
      media.value.getTracks().forEach(track => track.stop());
      media.value = null;
    }
  }

  try {
    if(isMicTest) isListening = false;
    stopStream();

    const newMedia = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: {
        echoCancellation: false,
        noiseSuppression: true,
        deviceId: selectedInput.value?.deviceId
      }
    });

    media.value = newMedia;

    await createMicNode();
    if(isMicTest) isListening = true;
  } catch (error) {
    console.error('Error changing microphone:', error);
  }
}