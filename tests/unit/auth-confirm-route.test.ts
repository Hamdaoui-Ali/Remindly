import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyOtp, createServerSupabaseClient, appUrl } = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  appUrl: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));
vi.mock('@/lib/env', () => ({ appUrl }));

import { GET } from '@/app/auth/confirm/route';

beforeEach(() => {
  verifyOtp.mockReset().mockResolvedValue({ error: null });
  createServerSupabaseClient.mockResolvedValue({ auth: { verifyOtp } });
  appUrl.mockReturnValue('http://localhost:3000');
});

describe('GET /auth/confirm', () => {
  it('verifies with the action-specific Supabase type', async () => {
    const response = await GET(new Request('http://localhost:3000/auth/confirm?token_hash=hash-1&type=recovery&next=%2Flogin'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/login');
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'hash-1', type: 'recovery' });
  });

  it('rejects malformed links without calling Supabase', async () => {
    const response = await GET(new Request('http://localhost:3000/auth/confirm?token_hash=hash-1&type=email'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/login?error=confirmation_failed');
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});
