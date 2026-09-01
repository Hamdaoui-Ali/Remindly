'use client';

import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { isValidEmail } from '@/lib/validation/auth';

const GENERIC_LOGIN_ERROR = 'Unable to sign in with those credentials.';

export type LoginState = {
  error: string | null;
  field: 'email' | 'password' | null;
  attempt: number;
};

export async function loginAction(
  previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = formData.get('email');
  const password = formData.get('password');

  if (typeof email !== 'string' || !isValidEmail(email)) {
    return {
      error: GENERIC_LOGIN_ERROR,
      field: 'email',
      attempt: previousState.attempt + 1,
    };
  }

  if (typeof password !== 'string' || password.length === 0) {
    return {
      error: GENERIC_LOGIN_ERROR,
      field: 'password',
      attempt: previousState.attempt + 1,
    };
  }

  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.user?.email_confirmed_at) {
      return {
        error: GENERIC_LOGIN_ERROR,
        field: 'email',
        attempt: previousState.attempt + 1,
      };
    }

    window.location.assign('/');
    return { error: null, field: null, attempt: previousState.attempt };
  } catch {
    return {
      error: GENERIC_LOGIN_ERROR,
      field: 'email',
      attempt: previousState.attempt + 1,
    };
  }
}
