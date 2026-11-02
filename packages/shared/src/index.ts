import { z } from 'zod';
export { encodeMemberName, decodeMemberName } from './memberName';

export const playerDataSchema = z.object({
  name: z.string(),
  dimension: z.number(), x: z.number(), y: z.number(), z: z.number(),
  telephone: z.number(), hasTelephone: z.number(),
  useMegaphone: z.number(), useMicrophone: z.number(),
  transceiverType: z.number(), transceiverNumber: z.number(), mute: z.number(),
  voiceRangeOutput: z.number(), volumeOutput: z.number(),
  voiceRangeInput: z.number(), volumeInput: z.number(),
});

export type PlayerData = z.infer<typeof playerDataSchema>;

export const PLAYER_DATA_FIELDS = [
  'name', 'dimension', 'x', 'y', 'z', 'telephone', 'hasTelephone',
  'useMegaphone', 'useMicrophone', 'transceiverType', 'transceiverNumber', 'mute',
  'voiceRangeOutput', 'volumeOutput', 'voiceRangeInput', 'volumeInput',
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
  debug: (data: unknown) => void;
}
