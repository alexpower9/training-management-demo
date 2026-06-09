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
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'admin',
      testMatch: /management\.spec\.js/,
      use: {
        baseURL: 'http://127.0.0.1:4173',
      },
    },
    {
      name: 'employee',
      testMatch: /employee\.spec\.js/,
      use: {
        baseURL: 'http://127.0.0.1:4174',
      },
    },
    {
      name: 'owner',
      testMatch: /owner\.spec\.js/,
      use: {
        baseURL: 'http://127.0.0.1:4175',
      },
    },
  ],
  webServer: [
    {
      command: 'npm run dev:api',
      url: 'http://127.0.0.1:4300/health',
      reuseExistingServer: !process.env.CI,
      env: {
        DATABASE_URL: process.env.TEST_DATABASE_URL,
        AUTH_MODE: 'development',
        NODE_ENV: 'test',
        PORT: '4300',
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
        VITE_API_PROXY_TARGET: 'http://127.0.0.1:4300',
      },
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 4174 --strictPort',
      url: 'http://127.0.0.1:4174',
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_AUTH_MODE: 'development',
        VITE_DEMO_ROLE: 'employee',
        VITE_DEMO_SUBJECT: '20000000-0000-4000-8000-000000000001',
        VITE_DATA_SOURCE: 'api',
        VITE_API_BASE_URL: '/api/v1',
        VITE_API_PROXY_TARGET: 'http://127.0.0.1:4300',
      },
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 4175 --strictPort',
      url: 'http://127.0.0.1:4175',
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_AUTH_MODE: 'development',
        VITE_DEMO_ROLE: 'owner',
        VITE_DATA_SOURCE: 'api',
        VITE_API_BASE_URL: '/api/v1',
        VITE_API_PROXY_TARGET: 'http://127.0.0.1:4300',
      },
    },
  ],
});
