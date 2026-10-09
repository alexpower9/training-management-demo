import { defineConfig, devices } from '@playwright/test';

// Test the production bundle at a repository subpath, as GitHub Pages serves it.
const baseURL = 'http://127.0.0.1:4173/nme-demo/';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command:
      'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort --base=/nme-demo/',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
