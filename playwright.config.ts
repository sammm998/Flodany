// Playwright (fas 2e): plattformen i 1280 och 375 punkters bredd mot den lokala Supabase.
// Körs i CI-jobbet databas efter att plattformen byggts (npm run e2e). Inga omkörningar.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  retries: 0,
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure', locale: 'sv-SE', timezoneId: 'Europe/Stockholm' },
  projects: [
    { name: 'bred', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'smal', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } } },
  ],
  webServer: { command: 'npm run preview -w @flodia/platform', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI, timeout: 60_000 },
});
