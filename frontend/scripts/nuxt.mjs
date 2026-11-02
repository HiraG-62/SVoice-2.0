import { existsSync } from 'node:fs';

const envFile = process.env.FRONTEND_ENV_FILE || (existsSync('.env') ? '.env' : undefined);

// nuxi dev は .env を読む前に待ち受けポートを決めるため、NUXT_PORT などを先に環境変数へ入れておく
if (envFile) process.loadEnvFile(envFile);
if (process.env.FRONTEND_ENV_FILE) {
  process.argv.push('--dotenv', process.env.FRONTEND_ENV_FILE);
}

await import(new URL('./bin/nuxt.mjs', import.meta.resolve('nuxt/package.json')).href);
