import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const { updateSupabaseSession } = vi.hoisted(() => ({
  updateSupabaseSession: vi.fn(),
}));

vi.mock('@/lib/supabase/proxy', () => ({ updateSupabaseSession }));

import { proxy } from '@/proxy';

function request(pathname: string): NextRequest {
  return new NextRequest(`http://localhost${pathname}`);
}

describe('Next.js Proxy authentication boundary', () => {
  beforeEach(() => {
    updateSupabaseSession.mockReset();
    updateSupabaseSession.mockResolvedValue({ response: NextResponse.next(), user: null });
  });

  it('allows public pages without a Supabase user', async () => {
    const response = await proxy(request('/register'));

    expect(response.status).toBe(200);
    expect(updateSupabaseSession).toHaveBeenCalledOnce();
  });

  it('allows an authenticated recovery session to reach the reset page', async () => {
    const refreshedResponse = NextResponse.next();
    updateSupabaseSession.mockResolvedValue({
      response: refreshedResponse,
      user: { id: 'user-123', email: 'user@example.com' },
    });

    await expect(proxy(request('/reset-password'))).resolves.toBe(refreshedResponse);
  });

  it('redirects an authenticated user away from the login page', async () => {
    updateSupabaseSession.mockResolvedValue({
      response: NextResponse.next(),
      user: { id: 'user-123', email: 'user@example.com' },
    });

    const response = await proxy(request('/login'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/');
  });

  it('redirects unauthenticated page requests to login', async () => {
    const response = await proxy(request('/reminders'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/login');
  });

  it('returns 401 for unauthenticated API requests', async () => {
    const response = await proxy(request('/api/reminders'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('allows authenticated protected requests with the refreshed response', async () => {
    const refreshedResponse = NextResponse.next();
    updateSupabaseSession.mockResolvedValue({
      response: refreshedResponse,
      user: { id: 'user-123', email: 'user@example.com' },
    });

    await expect(proxy(request('/settings'))).resolves.toBe(refreshedResponse);
  });

  it('allows scheduler and Auth Hook endpoints without a user session', async () => {
    for (const pathname of [
      '/api/health',
      '/api/internal/process-due-notifications',
      '/api/internal/auth/send-email',
    ]) {
      updateSupabaseSession.mockClear();
      const response = await proxy(request(pathname));

      expect(response.status).toBe(200);
      expect(updateSupabaseSession).not.toHaveBeenCalled();
    }
  });
});
