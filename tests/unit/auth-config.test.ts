import { hash } from 'bcryptjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { verifyOwnerCredentials } from '@/server/auth/config';
import { sessionCookieName, sessionCookieOptions } from '@/server/auth/session-cookie';

const { compareSpy } = vi.hoisted(() => ({ compareSpy: vi.fn() }));

vi.mock('bcryptjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('bcryptjs')>();
  compareSpy.mockImplementation(actual.compare);

  return { ...actual, compare: compareSpy };
});

describe('verifyOwnerCredentials', () => {
  beforeEach(async () => {
    vi.stubEnv('AUTH_SECRET', 'test-auth-secret-with-at-least-32-characters');
    vi.stubEnv('OWNER_EMAIL', 'owner@example.com');
    vi.stubEnv('OWNER_PASSWORD_HASH', await hash('correct-password', 4));
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost/remindly');
    vi.stubEnv('SCHEDULER_SECRET', 'test-scheduler-secret');
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('RESEND_FROM', 'Remindly <notifications@example.com>');
    vi.stubEnv('APP_URL', 'http://localhost:3000');
    vi.stubEnv('NODE_ENV', 'test');
    compareSpy.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects an email that is not the configured owner', async () => {
    await expect(
      verifyOwnerCredentials('other@example.com', 'correct-password'),
    ).resolves.toBe(false);
    expect(compareSpy).toHaveBeenCalledOnce();
    expect(compareSpy).toHaveBeenCalledWith(
      'correct-password',
      process.env.OWNER_PASSWORD_HASH,
    );
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

  it('rejects credentials safely when the configured bcrypt hash is malformed', async () => {
    vi.stubEnv('OWNER_PASSWORD_HASH', 'not-a-bcrypt-hash');

    await expect(
      verifyOwnerCredentials('owner@example.com', 'correct-password'),
    ).resolves.toBe(false);
  });
});

describe('session cookie policy', () => {
  it('uses a secure HTTP-only cookie in production', () => {
    expect(sessionCookieName('production')).toBe('__Secure-remindly.session-token');
    expect(sessionCookieOptions('production')).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
    });
  });
});
