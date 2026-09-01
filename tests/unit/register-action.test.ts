// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createBrowserSupabaseClient, signUp } = vi.hoisted(() => ({
  createBrowserSupabaseClient: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({ createBrowserSupabaseClient }));

import { registerAction } from '@/app/register/actions';

const initialState = { error: null, message: null, field: null, attempt: 0 } as const;

beforeEach(() => {
  createBrowserSupabaseClient.mockReset().mockReturnValue({ auth: { signUp } });
  signUp.mockReset();
});

describe('registerAction', () => {
  it('validates email, password, and confirmation locally', async () => {
    const formData = new FormData();
    formData.set('email', 'bad');
    formData.set('password', 'short');
    formData.set('confirmPassword', 'different');

    await expect(registerAction(initialState, formData)).resolves.toMatchObject({ field: 'email', attempt: 1 });
    expect(createBrowserSupabaseClient).not.toHaveBeenCalled();
  });

  it('returns a generic error for Supabase failures', async () => {
    signUp.mockResolvedValue({ error: new Error('email already registered') });
    const formData = new FormData();
    formData.set('email', 'user@example.com');
    formData.set('password', 'secure-password');
    formData.set('confirmPassword', 'secure-password');

    await expect(registerAction(initialState, formData)).resolves.toMatchObject({
      error: 'Unable to create your account. Please check your details and try again.',
      field: 'email',
      attempt: 1,
    });
  });

  it('returns a neutral confirmation message on success', async () => {
    signUp.mockResolvedValue({ error: null });
    const formData = new FormData();
    formData.set('email', 'user@example.com');
    formData.set('password', 'secure-password');
    formData.set('confirmPassword', 'secure-password');

    await expect(registerAction(initialState, formData)).resolves.toEqual({
      error: null,
      message: 'Check your email to confirm your Remindly account.',
      field: null,
      attempt: 0,
    });
    expect(signUp).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'secure-password',
      options: { emailRedirectTo: 'http://localhost:3000/auth/confirm' },
    });
  });
});
