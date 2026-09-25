'use server';

import { appUrl } from '@/lib/env';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isValidEmail } from '@/lib/validation/auth';
const GENERIC_REGISTER_ERROR = 'Unable to create your account. Please check your details and try again.';
const INVALID_EMAIL_ERROR = 'Enter a valid email address.';
const SHORT_PASSWORD_ERROR = 'Use at least 8 characters.';
const PASSWORD_MISMATCH_ERROR = 'Passwords do not match.';
const SUCCESS_MESSAGE = 'Check your email to confirm your Remindly account.';

function registerErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('email address') && message.includes('invalid')) return INVALID_EMAIL_ERROR;
  if (message.includes('already registered') || message.includes('already been registered')) {
    return 'An account with this email already exists. Try signing in.';
  }
  if (message.includes('rate limit') || message.includes('too many requests')) {
    return 'Too many attempts. Please wait a few minutes and try again.';
  }
  if (message.includes('redirect') && message.includes('not allowed')) {
    return 'Authentication redirect is not configured for this address.';
  }
  return GENERIC_REGISTER_ERROR;
}

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
  const rawEmail = formData.get('email');
  const email = typeof rawEmail === 'string' ? rawEmail.trim() : rawEmail;
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
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${appUrl()}/auth/confirm` },
    });
    if (error) throw error;
    return { error: null, message: SUCCESS_MESSAGE, field: null, attempt: previousState.attempt };
  } catch (error) {
    return { error: registerErrorMessage(error), message: null, field: 'email', attempt: previousState.attempt + 1 };
  }
}
