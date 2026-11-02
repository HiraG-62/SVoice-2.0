import { defineStore } from 'pinia';
import { DEFAULT_LEVEL, EXTENDED_LEVEL_MAX, NORMAL_LEVEL_MAX } from '../services/constants';

export interface AudioDevice { deviceId: string; label: string }
const clamp = (value: number, maximum: number) => Math.max(0, Math.min(maximum, Number(value) || 0));

export const useAudioStore = defineStore('audio', {
  state: () => ({
    micLevel: DEFAULT_LEVEL, phoneLevel: DEFAULT_LEVEL, muted: false, noiseSuppression: true,
    inputs: [] as AudioDevice[], outputs: [] as AudioDevice[],
    selectedInput: null as AudioDevice | null, selectedOutput: null as AudioDevice | null,
    ready: false, contextState: 'closed' as AudioContextState,
  }),
  actions: {
    hydrate() {
      for (const key of ['micLevel', 'phoneLevel'] as const) {
        const saved = localStorage.getItem(key);
        if (saved !== null && Number.isFinite(Number(saved))) this[key] = clamp(Number(saved), EXTENDED_LEVEL_MAX);
      }
    },
    setMicLevel(value: number) {
      this.micLevel = clamp(value, EXTENDED_LEVEL_MAX);
      localStorage.setItem('micLevel', String(this.micLevel));
    },
    setPhoneLevel(value: number) {
      this.phoneLevel = clamp(value, NORMAL_LEVEL_MAX);
      localStorage.setItem('phoneLevel', String(this.phoneLevel));
    },
    setMuted(value: boolean) { this.muted = value; },
    setNoiseSuppression(value: boolean) { this.noiseSuppression = value; },
    selectInput(value: AudioDevice | null) { this.selectedInput = value; },
    selectOutput(value: AudioDevice | null) { this.selectedOutput = value; },
    setDevices(devices: MediaDeviceInfo[], activeDevice?: string) {
      this.inputs = devices.filter(d => d.kind === 'audioinput').map(d => ({ deviceId: d.deviceId, label: d.label || 'Unknown Microphone' }));
      this.outputs = devices.filter(d => d.kind === 'audiooutput').map(d => ({ deviceId: d.deviceId, label: d.label || 'Unknown Speaker' }));
      this.selectedInput = this.inputs.find(d => d.deviceId === activeDevice) ?? this.inputs[0] ?? null;
      this.selectedOutput = this.outputs.find(d => d.deviceId === 'default') ?? this.outputs[0] ?? null;
    },
    setReady(ready: boolean, contextState: AudioContextState) { this.ready = ready; this.contextState = contextState; },
  },
});
