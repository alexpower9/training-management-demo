import { defineConfig } from '@playwright/test';

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL is required for Playwright management tests.');
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run dev:api',
      url: 'http://127.0.0.1:3000/health',
      reuseExistingServer: !process.env.CI,
      env: {
        DATABASE_URL: process.env.TEST_DATABASE_URL,
        AUTH_MODE: 'development',
        NODE_ENV: 'test',
      },
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 4173',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_AUTH_MODE: 'development',
        VITE_DEMO_ROLE: 'admin',
        VITE_DATA_SOURCE: 'api',
        VITE_API_BASE_URL: '/api/v1',
      },
    },
  ],
});
