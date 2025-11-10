import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests/canary',
  timeout: 30_000,
  expect: {
    timeout: 7_500
  },
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,
  reporter: [['list'], ['json', { outputFile: 'artifacts/canary-report.json' }]],
  outputDir: 'artifacts/playwright-results',
  use: {
    actionTimeout: 10_000,
    baseURL: process.env.CANARY_BASE_URL || 'https://www.facebook.com',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
