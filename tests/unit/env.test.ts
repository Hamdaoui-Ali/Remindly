import { describe, expect, it } from 'vitest';
import { parseServerEnv } from '@/lib/env';

describe('parseServerEnv', () => {
  it('rejects a missing owner password hash', () => {
    expect(() => parseServerEnv({
      DATABASE_URL: 'postgresql://localhost/remindly',
      AUTH_SECRET: 'a'.repeat(32),
      OWNER_EMAIL: 'owner@example.com',
      OWNER_PASSWORD_HASH: '',
      SCHEDULER_SECRET: 's'.repeat(16),
      RESEND_API_KEY: 're_test',
      APP_URL: 'http://localhost:3000',
      NODE_ENV: 'test',
    })).toThrow('OWNER_PASSWORD_HASH');
  });
});
