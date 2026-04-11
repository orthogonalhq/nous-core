import { defineConfig } from '@playwright/test';

export default defineConfig({
  projects: [
    {
      name: 'desktop',
      testDir: './specs/desktop',
    },
    {
      name: 'web',
      testDir: './specs/web',
      use: {
        baseURL: 'http://localhost:3199',
      },
    },
  ],
  webServer: {
    command: 'pnpm --filter @nous/web exec next start -p 3199',
    port: 3199,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  reporter: 'html',
});
