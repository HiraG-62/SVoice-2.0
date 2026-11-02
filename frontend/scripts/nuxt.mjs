if (process.env.FRONTEND_ENV_FILE) {
  process.argv.push('--dotenv', process.env.FRONTEND_ENV_FILE);
}

await import(new URL('./bin/nuxt.mjs', import.meta.resolve('nuxt/package.json')).href);
