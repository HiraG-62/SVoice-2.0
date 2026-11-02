import dotenv from 'dotenv';
import { z } from 'zod';

const configSchema = z.object({
  NODE_ENV: z.string().refine((value) => value !== 'dev', 'NODE_ENV must use development instead of dev').optional(),
  JOIN_PASSWORD: z.string().min(1),
  API_SECRET: z.string().min(1),
  SERVER_URL: z.string().optional(),
  GAME_API_SECRET: z.string().optional(),
  DISCORD_SERVER_ID: z.string().default(''),
  DISCORD_SERVER_ROOM_ID: z.string().default(''),
  DISCORD_SERVER_ROLE_ID_ADMIN: z.string().default(''),
  DISCORD_SERVER_ROLE_ID_PHONE: z.string().default(''),
  DISCORD_SERVER_ROLE_ID_JOIN: z.string().default(''),
});

export function parseConfig(env: NodeJS.ProcessEnv) {
  const config = configSchema.parse(env);
  return { ...config, isDevelopment: config.NODE_ENV === 'development' };
}

export type BackendConfig = ReturnType<typeof parseConfig>;

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  dependencies: { error: (message: string) => void; exit: (code: number) => never } = {
    error: console.error, exit: process.exit,
  },
): BackendConfig {
  if (env === process.env) dotenv.config();
  for (const key of ['JOIN_PASSWORD', 'API_SECRET'] as const) {
    if (!env[key]) {
      dependencies.error(`❌ ${key} environment variable is not set`);
      dependencies.exit(1);
    }
  }
  return parseConfig(env);
}
