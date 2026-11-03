import { defineConfig, devices } from '@playwright/test';
import { SITE } from './src/site.config.ts';

const PORT = 4321;
const baseURL = `http://localhost:${PORT}${SITE.basePath}`;

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env['CI'],
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL,
    // Most tests act as a returning visitor who already answered the consent question;
    // consent.spec.ts starts fresh to test the bar itself.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: `http://localhost:${PORT}`,
          localStorage: [{ name: 'xm-consent', value: 'denied' }],
        },
      ],
    },
  },
  webServer: {
    command: `pnpm preview --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env['CI'],
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
