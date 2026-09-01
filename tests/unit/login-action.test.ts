// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createBrowserSupabaseClient, signInWithPassword } = vi.hoisted(() => ({
  createBrowserSupabaseClient: vi.fn(),
  signInWithPassword: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({ createBrowserSupabaseClient }));

import { loginAction } from '@/app/login/actions';

const initialState = { error: null, field: null, attempt: 0 } as const;

beforeEach(() => {
  createBrowserSupabaseClient.mockReset();
  signInWithPassword.mockReset();
  createBrowserSupabaseClient.mockReturnValue({
    auth: { signInWithPassword },
  });
});

describe('loginAction', () => {
  it('returns field feedback without contacting Supabase for invalid input', async () => {
    const formData = new FormData();
    formData.set('email', 'not-an-email');

    await expect(loginAction(initialState, formData)).resolves.toMatchObject({
      field: 'email',
      attempt: 1,
    });
    expect(createBrowserSupabaseClient).not.toHaveBeenCalled();
  });

  it('maps Supabase sign-in errors to the generic login error', async () => {
    signInWithPassword.mockResolvedValue({ error: new Error('invalid credentials') });
    const formData = new FormData();
    formData.set('email', 'user@example.com');
    formData.set('password', 'password');

    await expect(loginAction(initialState, formData)).resolves.toMatchObject({
      error: 'Unable to sign in with those credentials.',
      field: 'email',
      attempt: 1,
    });
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'password',
    });
  });

  it('blocks a user whose email is not confirmed', async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: { email_confirmed_at: null } },
      error: null,
    });
    const formData = new FormData();
    formData.set('email', 'user@example.com');
    formData.set('password', 'password');

    await expect(loginAction(initialState, formData)).resolves.toMatchObject({
      error: 'Unable to sign in with those credentials.',
      field: 'email',
      attempt: 1,
    });
  });
});
