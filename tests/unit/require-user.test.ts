import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser },
  })),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((location: string) => {
    throw new Error(`REDIRECT:${location}`);
  }),
}));

import { redirect } from 'next/navigation';
import { getAuthenticatedUser, requireUser } from '@/server/auth/require-user';

describe('server-validated user authentication', () => {
  beforeEach(() => {
    getUser.mockReset();
    vi.mocked(redirect).mockClear();
  });

  it('returns the Supabase user identity and email', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'user@example.com' } },
      error: null,
    });

    await expect(getAuthenticatedUser()).resolves.toEqual({
      id: 'user-123',
      email: 'user@example.com',
    });
  });

  it('returns null when Supabase rejects the current session', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error('expired') });

    await expect(getAuthenticatedUser()).resolves.toBeNull();
  });

  it('redirects protected page flows when the user has no verified email identity', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: '' } },
      error: null,
    });

    await expect(requireUser()).rejects.toThrow('REDIRECT:/login');
    expect(redirect).toHaveBeenCalledWith('/login');
  });
});
