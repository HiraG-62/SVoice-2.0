import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  workers: 1,
  outputDir: '.results',
  reporter: [['list'], ['json', { outputFile: '.report.json' }]],
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:3100',
    browserName: 'chromium',
    actionTimeout: 10_000,
    permissions: ['microphone'],
    launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${resolve('e2e/fixtures/microphone.wav')}`] },
  },
});
