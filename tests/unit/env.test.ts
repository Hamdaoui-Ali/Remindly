import { describe, expect, it } from 'vitest';
import { parseServerEnv } from '@/lib/env';

describe('parseServerEnv', () => {
  it('rejects a missing owner password hash', () => {
    expect(() => parseServerEnv({
      DATABASE_URL: 'postgresql://localhost/remindly',
      DIRECT_URL: 'postgresql://localhost/remindly',
      AUTH_SECRET: 'a'.repeat(32),
      OWNER_EMAIL: 'owner@example.com',
      OWNER_PASSWORD_HASH: '',
      SCHEDULER_SECRET: 's'.repeat(16),
      RESEND_API_KEY: 're_test',
      RESEND_FROM: 'Remindly <notifications@example.com>',
      APP_URL: 'http://localhost:3000',
      NODE_ENV: 'test',
    })).toThrow('OWNER_PASSWORD_HASH');
  });

  it('rejects a missing direct migration URL', () => {
    expect(() => parseServerEnv({
      DATABASE_URL: 'postgresql://localhost/remindly',
      AUTH_SECRET: 'a'.repeat(32),
      OWNER_EMAIL: 'owner@example.com',
      OWNER_PASSWORD_HASH: 'hash',
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
      AUTH_SECRET: 'a'.repeat(32),
      OWNER_EMAIL: 'owner@example.com',
      OWNER_PASSWORD_HASH: 'hash',
      SCHEDULER_SECRET: 's'.repeat(16),
      RESEND_API_KEY: 're_test',
      RESEND_FROM: 'Remindly <notifications@example.com>',
      APP_URL: 'http://localhost:3000',
      NODE_ENV: 'test',
    });

    expect(env.DATABASE_URL).toBe('postgresql://pooler.example/remindly');
    expect(env.DIRECT_URL).toBe('postgresql://direct.example/remindly');
  });
});
