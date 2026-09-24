'use client';

import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { isValidEmail } from '@/lib/validation/auth';
const GENERIC_REGISTER_ERROR = 'Unable to create your account. Please check your details and try again.';
const INVALID_EMAIL_ERROR = 'Enter a valid email address.';
const SHORT_PASSWORD_ERROR = 'Use at least 8 characters.';
const PASSWORD_MISMATCH_ERROR = 'Passwords do not match.';
const SUCCESS_MESSAGE = 'Check your email to confirm your Remindly account.';

export type RegisterState = {
  error: string | null;
  message: string | null;
  field: 'email' | 'password' | 'confirmPassword' | null;
  attempt: number;
};

export async function registerAction(
  previousState: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const email = formData.get('email');
  const password = formData.get('password');
  const confirmPassword = formData.get('confirmPassword');
  if (typeof email !== 'string' || !isValidEmail(email)) {
    return { error: INVALID_EMAIL_ERROR, message: null, field: 'email', attempt: previousState.attempt + 1 };
  }
  if (typeof password !== 'string' || password.length < 8) {
    return { error: SHORT_PASSWORD_ERROR, message: null, field: 'password', attempt: previousState.attempt + 1 };
  }
  if (typeof confirmPassword !== 'string' || confirmPassword !== password) {
    return { error: PASSWORD_MISMATCH_ERROR, message: null, field: 'confirmPassword', attempt: previousState.attempt + 1 };
  }

  try {
    const { error } = await createBrowserSupabaseClient().auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    });
    if (error) throw error;
    return { error: null, message: SUCCESS_MESSAGE, field: null, attempt: previousState.attempt };
  } catch {
    return { error: GENERIC_REGISTER_ERROR, message: null, field: 'email', attempt: previousState.attempt + 1 };
  }
}
