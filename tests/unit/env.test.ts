import { describe, expect, it } from 'vitest';
import { parseServerEnv } from '@/lib/env';

describe('parseServerEnv', () => {
  it('rejects a missing scheduler secret', () => {
    expect(() => parseServerEnv({
      DATABASE_URL: 'postgresql://localhost/remindly',
      DIRECT_URL: 'postgresql://localhost/remindly',
      SCHEDULER_SECRET: '',
      RESEND_API_KEY: 're_test',
      RESEND_FROM: 'Remindly <notifications@example.com>',
      APP_URL: 'http://localhost:3000',
      NODE_ENV: 'test',
    })).toThrow('SCHEDULER_SECRET');
  });

  it('accepts runtime configuration without the migration-only direct URL', () => {
    const env = parseServerEnv({
      DATABASE_URL: 'postgresql://localhost/remindly',
      SCHEDULER_SECRET: 's'.repeat(16),
      RESEND_API_KEY: 're_test',
      RESEND_FROM: 'Remindly <notifications@example.com>',
      APP_URL: 'http://localhost:3000',
      NODE_ENV: 'test',
    });

    expect(env.DATABASE_URL).toBe('postgresql://localhost/remindly');
  });

  it('requires complete Gmail configuration when Gmail is selected', () => {
    expect(() => parseServerEnv({
      DATABASE_URL: 'postgresql://pooler.example/remindly',
      DIRECT_URL: 'postgresql://direct.example/remindly',
      SCHEDULER_SECRET: 's'.repeat(16),
      RESEND_API_KEY: 're_test',
      RESEND_FROM: 'Remindly <notifications@example.com>',
      EMAIL_PROVIDER: 'gmail',
      APP_URL: 'http://localhost:3000',
      NODE_ENV: 'test',
    })).toThrow('GMAIL_CLIENT_ID');
  });

  it('accepts Gmail configuration without unused Resend credentials', () => {
    const env = parseServerEnv({
      DATABASE_URL: 'postgresql://pooler.example/remindly',
      SCHEDULER_SECRET: 's'.repeat(16),
      EMAIL_PROVIDER: 'gmail',
      GMAIL_CLIENT_ID: 'gmail-client-id',
      GMAIL_CLIENT_SECRET: 'gmail-client-secret',
      GMAIL_REFRESH_TOKEN: 'gmail-refresh-token',
      GMAIL_SENDER_EMAIL: 'notifications@example.com',
      APP_URL: 'http://localhost:3000',
      NODE_ENV: 'test',
    });

    expect(env.EMAIL_PROVIDER).toBe('gmail');
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.RESEND_FROM).toBeUndefined();
  });

  it('requires Resend credentials when Resend is selected', () => {
    expect(() => parseServerEnv({
      DATABASE_URL: 'postgresql://pooler.example/remindly',
      SCHEDULER_SECRET: 's'.repeat(16),
      EMAIL_PROVIDER: 'resend',
      APP_URL: 'http://localhost:3000',
      NODE_ENV: 'test',
    })).toThrow('RESEND_API_KEY');
  });

  it('normalizes provider casing and whitespace before validation', () => {
    const env = parseServerEnv({
      DATABASE_URL: 'postgresql://pooler.example/remindly',
      SCHEDULER_SECRET: 's'.repeat(16),
      EMAIL_PROVIDER: '  "RESEND"\n',
      RESEND_API_KEY: 're_test',
      RESEND_FROM: 'Remindly <notifications@example.com>',
      APP_URL: 'http://localhost:3000',
      NODE_ENV: 'test',
    });

    expect(env.EMAIL_PROVIDER).toBe('resend');
  });

  it('treats blank unused Gmail variables as absent for Resend delivery', () => {
    const env = parseServerEnv({
      DATABASE_URL: 'postgresql://pooler.example/remindly',
      SCHEDULER_SECRET: 's'.repeat(16),
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_test',
      RESEND_FROM: 'Remindly <notifications@example.com>',
      GMAIL_CLIENT_ID: '',
      GMAIL_CLIENT_SECRET: '  ',
      GMAIL_REFRESH_TOKEN: '',
      GMAIL_SENDER_EMAIL: '',
      GMAIL_SENDER_NAME: '',
      GMAIL_TOTAL_DAILY_BUDGET: '',
      GMAIL_AUTH_RESERVE: '',
      GMAIL_REQUEST_TIMEOUT_MS: '',
      GMAIL_AUTH_HOOK_TOTAL_TIMEOUT_MS: '',
      APP_URL: 'http://localhost:3000',
      NODE_ENV: 'test',
    });

    expect(env.EMAIL_PROVIDER).toBe('resend');
    expect(env.GMAIL_CLIENT_ID).toBeUndefined();
    expect(env.GMAIL_TOTAL_DAILY_BUDGET).toBe(350);
  });

  it('accepts a reminder-only recipient override for provider sandbox delivery', () => {
    const env = parseServerEnv({
      DATABASE_URL: 'postgresql://pooler.example/remindly',
      SCHEDULER_SECRET: 's'.repeat(16),
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_test',
      RESEND_FROM: 'onboarding@resend.dev',
      REMINDER_RECIPIENT_OVERRIDE: 'resend-owner@example.com',
      APP_URL: 'http://localhost:3000',
      NODE_ENV: 'test',
    });

    expect(env.REMINDER_RECIPIENT_OVERRIDE).toBe('resend-owner@example.com');
  });
});
