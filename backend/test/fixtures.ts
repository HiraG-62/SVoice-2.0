import type { PlayerData } from '@svoice/shared';
import { parseConfig } from '../src/config';

export const player: PlayerData = {
  name: 'Player1', dimension: 0, x: 100, y: 64, z: 200,
  telephone: 0, hasTelephone: 0, useMegaphone: 0, useMicrophone: 0,
  transceiverType: 0, transceiverNumber: 0, mute: 0,
  voiceRangeOutput: 100, volumeOutput: 100, voiceRangeInput: 100, volumeInput: 100,
};

export const config = parseConfig({
  NODE_ENV: 'development', API_SECRET: 'test-secret', JOIN_PASSWORD: 'test-password',
  DISCORD_SERVER_ID: 'guild', DISCORD_SERVER_ROOM_ID: 'room',
  DISCORD_SERVER_ROLE_ID_ADMIN: 'admin', DISCORD_SERVER_ROLE_ID_PHONE: 'phone',
  DISCORD_SERVER_ROLE_ID_JOIN: 'join', SERVER_URL: 'http://localhost:3000',
});
