import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './e2e', workers: 1, use: { baseURL: 'http://127.0.0.1:5173', launchOptions: { executablePath: process.env.CHROMIUM_PATH } }, webServer: [
  { command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI, timeout: 30_000 },
  { command: 'npm run dev:studio', url: 'http://127.0.0.1:5174', reuseExistingServer: !process.env.CI, timeout: 30_000 }
] });
