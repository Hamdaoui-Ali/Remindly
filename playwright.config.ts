import { defineConfig, devices } from '@playwright/test';
import { hashSync } from 'bcryptjs';

const ownerEmail = process.env.E2E_OWNER_EMAIL ?? 'owner@example.com';
const ownerPassword = process.env.E2E_OWNER_PASSWORD ?? 'correct-password';

export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  webServer: {
    command: 'npm run dev -- --hostname 127.0.0.1',
    url: 'http://127.0.0.1:3000/login',
    reuseExistingServer: false,
    env: {
      APP_URL: 'http://127.0.0.1:3000',
      AUTH_SECRET: 'test-auth-secret-with-at-least-32-characters',
      DATABASE_URL: process.env.E2E_DATABASE_URL
        ?? process.env.DATABASE_URL
        ?? 'postgresql://remindly:remindly@localhost:5432/remindly?schema=public',
      NEXTAUTH_URL: 'http://127.0.0.1:3000',
      OWNER_EMAIL: ownerEmail,
      OWNER_PASSWORD_HASH: hashSync(ownerPassword, 4),
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
