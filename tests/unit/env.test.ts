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

  it('rejects a missing direct migration URL', () => {
    expect(() => parseServerEnv({
      DATABASE_URL: 'postgresql://localhost/remindly',
      SCHEDULER_SECRET: 's'.repeat(16),
      RESEND_API_KEY: 're_test',
      RESEND_FROM: 'Remindly <notifications@example.com>',
      APP_URL: 'http://localhost:3000',
      NODE_ENV: 'test',
    })).toThrow('DIRECT_URL');
  });

  it('accepts separate runtime and migration URLs', () => {
    const env = parseServerEnv({
      DATABASE_URL: 'postgresql://pooler.example/remindly',
      DIRECT_URL: 'postgresql://direct.example/remindly',
      SCHEDULER_SECRET: 's'.repeat(16),
      RESEND_API_KEY: 're_test',
      RESEND_FROM: 'Remindly <notifications@example.com>',
      APP_URL: 'http://localhost:3000',
      NODE_ENV: 'test',
    });

    expect(env.DATABASE_URL).toBe('postgresql://pooler.example/remindly');
    expect(env.DIRECT_URL).toBe('postgresql://direct.example/remindly');
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
});
