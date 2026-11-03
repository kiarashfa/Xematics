import { defineConfig, devices } from '@playwright/test';
import { SITE } from './src/site.config.ts';

const PORT = 4321;
const baseURL = `http://localhost:${PORT}${SITE.basePath}`;

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env['CI'],
  reporter: process.env['CI'] ? 'github' : 'list',
  use: { baseURL },
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
