// @vitest-environment node

import { encode } from 'next-auth/jwt';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { middleware } from '@/middleware';
import { sessionCookieName } from '@/server/auth/session-cookie';

const AUTH_SECRET = 'test-auth-secret-with-at-least-32-characters';

async function requestWithToken(
  pathname: string,
  email?: string,
  secret = AUTH_SECRET,
) {
  const token = await encode({
    secret,
    token: { sub: 'owner', email },
  });

  return new NextRequest(`http://localhost${pathname}`, {
    headers: { cookie: `${sessionCookieName('test')}=${token}` },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('authentication middleware', () => {
  it('fails closed when the owner email is missing even for a signed token', async () => {
    vi.stubEnv('AUTH_SECRET', AUTH_SECRET);
    vi.stubEnv('OWNER_EMAIL', undefined);

    const response = await middleware(await requestWithToken('/'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/login');
  });

  it('rejects a signed token for a different email', async () => {
    vi.stubEnv('AUTH_SECRET', AUTH_SECRET);
    vi.stubEnv('OWNER_EMAIL', 'owner@example.com');

    const response = await middleware(await requestWithToken('/', 'other@example.com'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/login');
  });

  it('fails closed when the auth secret is too short', async () => {
    vi.stubEnv('AUTH_SECRET', 'short');
    vi.stubEnv('OWNER_EMAIL', 'owner@example.com');

    const response = await middleware(new NextRequest('http://localhost/'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/login');
  });

  it('fails closed when the owner email is blank', async () => {
    vi.stubEnv('AUTH_SECRET', AUTH_SECRET);
    vi.stubEnv('OWNER_EMAIL', '   ');

    const response = await middleware(new NextRequest('http://localhost/'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/login');
  });

  it('fails closed when the owner email is malformed', async () => {
    vi.stubEnv('AUTH_SECRET', AUTH_SECRET);
    vi.stubEnv('OWNER_EMAIL', 'not-an-email');

    const response = await middleware(
      await requestWithToken('/', 'not-an-email'),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/login');
  });

  it('fails closed when the auth secret contains only whitespace', async () => {
    const whitespaceSecret = ' '.repeat(32);
    vi.stubEnv('AUTH_SECRET', whitespaceSecret);
    vi.stubEnv('OWNER_EMAIL', 'owner@example.com');

    const response = await middleware(
      await requestWithToken('/', 'owner@example.com', whitespaceSecret),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/login');
  });

  it('keeps the health endpoint public when auth configuration is absent', async () => {
    vi.stubEnv('AUTH_SECRET', undefined);
    vi.stubEnv('OWNER_EMAIL', undefined);

    const response = await middleware(new NextRequest('http://localhost/api/health'));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('passes the internal processor to its scheduler-secret boundary', async () => {
    vi.stubEnv('AUTH_SECRET', undefined);
    vi.stubEnv('OWNER_EMAIL', undefined);

    const response = await middleware(new NextRequest(
      'http://localhost/api/internal/process-due-notifications',
      { method: 'POST' },
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('keeps the Auth.js protocol endpoint public', async () => {
    vi.stubEnv('AUTH_SECRET', undefined);
    vi.stubEnv('OWNER_EMAIL', undefined);

    const response = await middleware(new NextRequest('http://localhost/api/auth/csrf'));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('returns 401 for protected APIs when auth configuration is absent', async () => {
    vi.stubEnv('AUTH_SECRET', undefined);
    vi.stubEnv('OWNER_EMAIL', undefined);

    const response = await middleware(new NextRequest('http://localhost/api/private'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });
});
