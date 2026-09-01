'use client';

import { createBrowserSupabaseClient } from '@/lib/supabase/client';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC_FORGOT_ERROR = 'Unable to send the password reset email. Please check your details and try again.';
const RESET_MESSAGE = 'If an account exists for that email, we sent a password reset link.';
const GENERIC_RESET_ERROR = 'Unable to update your password. Please try again.';

export type PasswordRecoveryState = {
  error: string | null;
  message: string | null;
  field: 'email' | 'password' | 'confirmPassword' | null;
  attempt: number;
};

function invalid(state: PasswordRecoveryState, field: PasswordRecoveryState['field'], error: string): PasswordRecoveryState {
  return { error, message: null, field, attempt: state.attempt + 1 };
}

export async function forgotPasswordAction(
  previousState: PasswordRecoveryState,
  formData: FormData,
): Promise<PasswordRecoveryState> {
  const email = formData.get('email');
  if (typeof email !== 'string' || !EMAIL_PATTERN.test(email)) {
    return invalid(previousState, 'email', GENERIC_FORGOT_ERROR);
  }

  try {
    const { error } = await createBrowserSupabaseClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm?next=%2Freset-password`,
    });
    if (error) throw error;
    return { error: null, message: RESET_MESSAGE, field: null, attempt: previousState.attempt };
  } catch {
    return invalid(previousState, 'email', GENERIC_FORGOT_ERROR);
  }
}

export async function resetPasswordAction(
  previousState: PasswordRecoveryState,
  formData: FormData,
): Promise<PasswordRecoveryState> {
  const password = formData.get('password');
  const confirmPassword = formData.get('confirmPassword');
  if (typeof password !== 'string' || password.length < 8) {
    return invalid(previousState, 'password', GENERIC_RESET_ERROR);
  }
  if (typeof confirmPassword !== 'string' || confirmPassword !== password) {
    return invalid(previousState, 'confirmPassword', GENERIC_RESET_ERROR);
  }

  try {
    const { error } = await createBrowserSupabaseClient().auth.updateUser({ password });
    if (error) throw error;
    return {
      error: null,
      message: 'Your password was updated. You can now sign in.',
      field: null,
      attempt: previousState.attempt,
    };
  } catch {
    return invalid(previousState, 'password', GENERIC_RESET_ERROR);
  }
}
