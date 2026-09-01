// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createBrowserSupabaseClient, resetPasswordForEmail, updateUser } = vi.hoisted(() => ({
  createBrowserSupabaseClient: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({ createBrowserSupabaseClient }));

import { forgotPasswordAction, resetPasswordAction } from '@/app/forgot-password/actions';

const initialForgotState = { error: null, message: null, field: null, attempt: 0 } as const;
const initialResetState = { error: null, message: null, field: null, attempt: 0 } as const;

beforeEach(() => {
  createBrowserSupabaseClient.mockReset().mockReturnValue({ auth: { resetPasswordForEmail, updateUser } });
  resetPasswordForEmail.mockReset();
  updateUser.mockReset();
});

describe('forgotPasswordAction', () => {
  it('rejects malformed email without calling Supabase', async () => {
    const formData = new FormData();
    formData.set('email', 'bad');

    await expect(forgotPasswordAction(initialForgotState, formData)).resolves.toMatchObject({
      error: 'Unable to send the password reset email. Please check your details and try again.',
      field: 'email',
      attempt: 1,
    });
    expect(createBrowserSupabaseClient).not.toHaveBeenCalled();
  });

  it('returns the same generic failure for provider errors', async () => {
    resetPasswordForEmail.mockResolvedValue({ error: new Error('email not found') });
    const formData = new FormData();
    formData.set('email', 'user@example.com');

    await expect(forgotPasswordAction(initialForgotState, formData)).resolves.toMatchObject({
      error: 'Unable to send the password reset email. Please check your details and try again.',
      field: 'email',
      attempt: 1,
    });
  });

  it('returns a neutral message after requesting a reset', async () => {
    resetPasswordForEmail.mockResolvedValue({ error: null });
    const formData = new FormData();
    formData.set('email', 'user@example.com');

    await expect(forgotPasswordAction(initialForgotState, formData)).resolves.toEqual({
      error: null,
      message: 'If an account exists for that email, we sent a password reset link.',
      field: null,
      attempt: 0,
    });
    expect(resetPasswordForEmail).toHaveBeenCalledWith('user@example.com', {
      redirectTo: 'http://localhost:3000/auth/confirm?next=%2Freset-password',
    });
  });
});

describe('resetPasswordAction', () => {
  it('validates the new password locally', async () => {
    const formData = new FormData();
    formData.set('password', 'short');
    formData.set('confirmPassword', 'different');

    await expect(resetPasswordAction(initialResetState, formData)).resolves.toMatchObject({
      error: 'Unable to update your password. Please try again.',
      field: 'password',
      attempt: 1,
    });
    expect(createBrowserSupabaseClient).not.toHaveBeenCalled();
  });

  it('updates the password and returns a sign-in message', async () => {
    updateUser.mockResolvedValue({ error: null });
    const formData = new FormData();
    formData.set('password', 'secure-password');
    formData.set('confirmPassword', 'secure-password');

    await expect(resetPasswordAction(initialResetState, formData)).resolves.toEqual({
      error: null,
      message: 'Your password was updated. You can now sign in.',
      field: null,
      attempt: 0,
    });
    expect(updateUser).toHaveBeenCalledWith({ password: 'secure-password' });
  });
});
