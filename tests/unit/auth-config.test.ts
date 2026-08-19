import { hash } from 'bcryptjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { verifyOwnerCredentials } from '@/server/auth/config';

describe('verifyOwnerCredentials', () => {
  beforeEach(async () => {
    vi.stubEnv('AUTH_SECRET', 'test-auth-secret-with-at-least-32-characters');
    vi.stubEnv('OWNER_EMAIL', 'owner@example.com');
    vi.stubEnv('OWNER_PASSWORD_HASH', await hash('correct-password', 4));
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost/remindly');
    vi.stubEnv('SCHEDULER_SECRET', 'test-scheduler-secret');
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('APP_URL', 'http://localhost:3000');
    vi.stubEnv('NODE_ENV', 'test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects an email that is not the configured owner', async () => {
    await expect(
      verifyOwnerCredentials('other@example.com', 'correct-password'),
    ).resolves.toBe(false);
  });

  it('rejects an incorrect password for the configured owner', async () => {
    await expect(
      verifyOwnerCredentials('owner@example.com', 'incorrect-password'),
    ).resolves.toBe(false);
  });

  it('accepts the configured owner with the correct password', async () => {
    await expect(
      verifyOwnerCredentials('owner@example.com', 'correct-password'),
    ).resolves.toBe(true);
  });
});
