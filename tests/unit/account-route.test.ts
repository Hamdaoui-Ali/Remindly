import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireUser, getUser, getSession, deleteUser } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getUser: vi.fn(),
  getSession: vi.fn(),
  deleteUser: vi.fn(),
}));

vi.mock('@/server/auth/require-user', () => ({ requireUser }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({ auth: { getUser, getSession } })),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: vi.fn(() => ({ auth: { admin: { deleteUser } } })),
}));

import { DELETE } from '@/app/api/account/route';

const APP_URL = 'https://app.example';
const USER = { id: 'user-a', email: 'a@example.com' };

function tokenWithAuthTime(authTime: number): string {
  const payload = Buffer.from(JSON.stringify({ auth_time: authTime })).toString('base64url');
  return `header.${payload}.signature`;
}

function requestFromAppOrigin(options: RequestInit = {}) {
  return new Request(`${APP_URL}/api/account`, {
    ...options,
    method: 'DELETE',
    headers: { origin: APP_URL, ...(options.headers ?? {}) },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('APP_URL', APP_URL);
  requireUser.mockResolvedValue(USER);
  getUser.mockResolvedValue({ data: { user: USER }, error: null });
  getSession.mockResolvedValue({ data: { session: { access_token: tokenWithAuthTime(Math.floor(Date.now() / 1000)) } } });
  deleteUser.mockResolvedValue({ error: null });
});

describe('DELETE /api/account', () => {
  it('rejects a destructive request from a different origin', async () => {
    const response = await DELETE(new Request(`${APP_URL}/api/account`, {
      method: 'DELETE',
      headers: { origin: 'https://evil.example' },
    }));

    expect(response.status).toBe(403);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('deletes only the authenticated Supabase user', async () => {
    const response = await DELETE(requestFromAppOrigin());

    expect(response.status).toBe(204);
    expect(deleteUser).toHaveBeenCalledWith(USER.id);
  });

  it('requires reauthentication when auth_time is older than ten minutes', async () => {
    getSession.mockResolvedValue({
      data: { session: { access_token: tokenWithAuthTime(Math.floor(Date.now() / 1000) - 601) } },
    });

    const response = await DELETE(requestFromAppOrigin());

    expect(response.status).toBe(401);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('rejects a request without an Origin header', async () => {
    const response = await DELETE(new Request(`${APP_URL}/api/account`, { method: 'DELETE' }));

    expect(response.status).toBe(403);
    expect(deleteUser).not.toHaveBeenCalled();
  });
});
