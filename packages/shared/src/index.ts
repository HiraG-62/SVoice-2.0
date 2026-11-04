import { z } from 'zod';
export { encodeMemberName, decodeMemberName } from './memberName';

export const playerDataSchema = z.object({
  name: z.string().min(1),
  location: z.object({
    server: z.number().finite(), dimension: z.number().finite(),
    coordinates: z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() }),
  }),
  telephone: z.number().finite(), hasTelephone: z.number().finite(),
  useMegaphone: z.number().finite(), useMicrophone: z.number().finite(),
  transceiver: z.object({ type: z.number().finite(), number: z.number().finite() }),
  radio: z.object({ type: z.number().finite(), number: z.number().finite() }),
  music: z.number().finite(), mute: z.number().finite(),
  voiceOptions: z.object({
    rangeOutput: z.number().finite(), volumeOutput: z.number().finite(),
    rangeInput: z.number().finite(), volumeInput: z.number().finite(),
  }),
});

export type PlayerData = z.infer<typeof playerDataSchema>;

export const PLAYER_DATA_FIELDS = [
  'name', 'location', 'telephone', 'hasTelephone', 'useMegaphone', 'useMicrophone',
  'transceiver', 'radio', 'music', 'mute', 'voiceOptions',
] as const satisfies readonly (keyof PlayerData)[];

const volumeSettingSchema = z.object({
  value: z.number(), min: z.number(), max: z.number(), step: z.number(), label: z.string(),
});

export type VolumeSetting = z.infer<typeof volumeSettingSchema>;

const deviceSettingSchema = z.object({
  value: z.object({
    volumeGain: volumeSettingSchema,
    minDistance: volumeSettingSchema,
    maxDistance: volumeSettingSchema,
  }),
  label: z.string(),
});

export const ingameSettingsSchema = z.object({
  general: z.object({
    value: z.object({
      minVolume: volumeSettingSchema,
      minDistance: volumeSettingSchema,
      maxDistance: volumeSettingSchema,
      callingVolume: volumeSettingSchema,
    }),
    label: z.string(),
  }),
  microphone: deviceSettingSchema,
  megaphone: deviceSettingSchema,
});

export type IngameSettings = z.infer<typeof ingameSettingsSchema>;

export interface ServerToClientEvents {
  joined: (speakers: (string | null)[]) => void;
  playerData: (players: PlayerData[]) => void;
  changeSetting: () => void;
  setAdminSpeaker: (speakers: (string | null)[]) => void;
  kicked: () => void;
}

export interface ClientToServerEvents {
  join: (gamerTag: string) => void;
  changeSetting: (data?: string) => void;
  onSpeaker: () => void;
  offSpeaker: () => void;
  exit: () => void;
  kick: (gamerTag: string) => void;
  debug: (data: unknown, ack?: (result: { ok: boolean }) => void) => void;
}
