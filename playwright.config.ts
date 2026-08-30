import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  webServer: {
    command: 'npm run dev -- --hostname 127.0.0.1',
    url: 'http://127.0.0.1:3000/login',
    reuseExistingServer: false,
    env: {
      APP_URL: 'http://127.0.0.1:3000',
      DATABASE_URL: process.env.E2E_DATABASE_URL
        ?? process.env.DATABASE_URL
        ?? 'postgresql://remindly:remindly@localhost:5432/remindly?schema=public',
      DIRECT_URL: process.env.E2E_DATABASE_URL
        ?? process.env.DATABASE_URL
        ?? 'postgresql://remindly:remindly@localhost:5432/remindly?schema=public',
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'test-publishable-key',
      SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY ?? 'test-secret-key',
      RESEND_API_KEY: 're_test',
      RESEND_FROM: 'Remindly <notifications@example.com>',
      SCHEDULER_SECRET: 'test-scheduler-secret',
    },
  },
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
