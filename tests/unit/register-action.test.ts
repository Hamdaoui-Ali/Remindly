// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createServerSupabaseClient, serverEnv, signUp } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  serverEnv: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));
vi.mock('@/lib/env', () => ({ serverEnv }));

import { registerAction } from '@/app/register/actions';

const initialState = { error: null, message: null, field: null, attempt: 0 } as const;

beforeEach(() => {
  createServerSupabaseClient.mockReset().mockResolvedValue({ auth: { signUp } });
  serverEnv.mockReset().mockReturnValue({ APP_URL: 'https://remindlly.vercel.app' });
  signUp.mockReset();
});

describe('registerAction', () => {
  it('explains malformed email input locally', async () => {
    const formData = new FormData();
    formData.set('email', 'bad');
    formData.set('password', 'short');
    formData.set('confirmPassword', 'different');

    await expect(registerAction(initialState, formData)).resolves.toMatchObject({
      error: 'Enter a valid email address.',
      field: 'email',
      attempt: 1,
    });
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it('trims surrounding whitespace before submitting a valid email', async () => {
    signUp.mockResolvedValue({ error: null });
    const formData = new FormData();
    formData.set('email', ' owner@example.com ');
    formData.set('password', 'secure-password');
    formData.set('confirmPassword', 'secure-password');

    await expect(registerAction(initialState, formData)).resolves.toMatchObject({
      error: null,
      message: 'Check your email to confirm your Remindly account.',
    });
    expect(signUp).toHaveBeenCalledWith(expect.objectContaining({ email: 'owner@example.com' }));
  });

  it('explains short passwords locally', async () => {
    const formData = new FormData();
    formData.set('email', 'user@example.com');
    formData.set('password', 'short');
    formData.set('confirmPassword', 'short');

    await expect(registerAction(initialState, formData)).resolves.toMatchObject({
      error: 'Use at least 8 characters.',
      field: 'password',
      attempt: 1,
    });
  });

  it('explains mismatched passwords locally', async () => {
    const formData = new FormData();
    formData.set('email', 'user@example.com');
    formData.set('password', 'secure-password');
    formData.set('confirmPassword', 'different-password');

    await expect(registerAction(initialState, formData)).resolves.toMatchObject({
      error: 'Passwords do not match.',
      field: 'confirmPassword',
      attempt: 1,
    });
  });

  it('explains when the email is already registered', async () => {
    signUp.mockResolvedValue({ error: new Error('email already registered') });
    const formData = new FormData();
    formData.set('email', 'user@example.com');
    formData.set('password', 'secure-password');
    formData.set('confirmPassword', 'secure-password');

    await expect(registerAction(initialState, formData)).resolves.toMatchObject({
      error: 'An account with this email already exists. Try signing in.',
      field: 'email',
      attempt: 1,
    });
  });

  it('explains a Supabase email validation failure', async () => {
    signUp.mockResolvedValue({ error: new Error('Email address is invalid') });
    const formData = new FormData();
    formData.set('email', 'user@example.com');
    formData.set('password', 'secure-password');
    formData.set('confirmPassword', 'secure-password');

    await expect(registerAction(initialState, formData)).resolves.toMatchObject({
      error: 'Enter a valid email address.',
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
      options: { emailRedirectTo: 'https://remindlly.vercel.app/auth/confirm' },
    });
  });

  it('uses the canonical server app URL for the confirmation redirect', async () => {
    signUp.mockResolvedValue({ error: null });
    const formData = new FormData();
    formData.set('email', 'user@example.com');
    formData.set('password', 'secure-password');
    formData.set('confirmPassword', 'secure-password');

    await registerAction(initialState, formData);

    expect(serverEnv).toHaveBeenCalled();
    expect(signUp).toHaveBeenCalledWith(expect.objectContaining({
      options: { emailRedirectTo: 'https://remindlly.vercel.app/auth/confirm' },
    }));
  });
});
