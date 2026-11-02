import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'node:path';

export const BACKEND_ROOT = path.resolve(__dirname, '..');
const portSchema = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(65535));
const booleanSchema = z.enum(['true', 'false']).default('true').transform((value) => value === 'true');
const gameConfigSchema = z.object({
  GAME_RECEIVER_PORT: portSchema.default(30000),
  GAME_API_SECRET: z.string().optional(),
});

const configSchema = gameConfigSchema.extend({
  NODE_ENV: z.string().refine((value) => value !== 'dev', 'NODE_ENV must use development instead of dev').optional(),
  JOIN_PASSWORD: z.string().min(1),
  API_SECRET: z.string().min(1),
  SERVER_URL: z.string().optional(),
  SOCKET_PORT: portSchema.default(3001),
  DISCORD_HTTP_PORT: portSchema.default(5000),
  DISCORD_TLS_PORT: portSchema.default(1234),
  TLS_KEY_PATH: z.string().default('key/privkey.pem'),
  TLS_CERT_PATH: z.string().default('key/fullchain.pem'),
  DISCORD_TOKENS_PATH: z.string().default('env/tokens.json'),
  DATA_DIR: z.string().default('.'),
  DISCORD_ENABLED: booleanSchema,
  DISCORD_MEMBER_COUNT_ENABLED: booleanSchema,
  DISCORD_SERVER_ID: z.string().default(''),
  DISCORD_SERVER_ROOM_ID: z.string().default(''),
  DISCORD_SERVER_ROLE_ID_ADMIN: z.string().default(''),
  DISCORD_SERVER_ROLE_ID_PHONE: z.string().default(''),
  DISCORD_SERVER_ROLE_ID_JOIN: z.string().default(''),
});

export function parseConfig(env: NodeJS.ProcessEnv) {
  const config = configSchema.parse(env);
  return {
    ...config, isDevelopment: config.NODE_ENV === 'development',
    TLS_KEY_PATH: resolveBackendPath(config.TLS_KEY_PATH),
    TLS_CERT_PATH: resolveBackendPath(config.TLS_CERT_PATH),
    DISCORD_TOKENS_PATH: resolveBackendPath(config.DISCORD_TOKENS_PATH),
    DATA_DIR: resolveBackendPath(config.DATA_DIR),
  };
}

export type BackendConfig = ReturnType<typeof parseConfig>;

export function resolveBackendPath(value: string) {
  return path.resolve(BACKEND_ROOT, value);
}

export function loadEnvironment(env: NodeJS.ProcessEnv = process.env) {
  dotenv.config({ path: resolveBackendPath(env.ENV_FILE ?? '.env'), processEnv: env, quiet: true });
}

export function parseGameConfig(env: NodeJS.ProcessEnv) {
  return gameConfigSchema.parse(env);
}

export function logConfigPaths(config: BackendConfig, logger: Pick<Console, 'log'> = console) {
  for (const key of ['DATA_DIR', 'TLS_KEY_PATH', 'TLS_CERT_PATH', 'DISCORD_TOKENS_PATH'] as const) {
    logger.log(`${key}: ${config[key]}`);
  }
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  dependencies: { error: (message: string) => void; exit: (code: number) => never } = {
    error: console.error, exit: process.exit,
  },
): BackendConfig {
  if (env === process.env) loadEnvironment(env);
  for (const key of ['JOIN_PASSWORD', 'API_SECRET'] as const) {
    if (!env[key]) {
      dependencies.error(`❌ ${key} environment variable is not set`);
      dependencies.exit(1);
    }
  }
  return parseConfig(env);
}
