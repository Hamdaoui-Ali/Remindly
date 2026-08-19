'use client';

import { signIn } from 'next-auth/react';

const GENERIC_LOGIN_ERROR = 'Unable to sign in with those credentials.';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  if (typeof email !== 'string' || !EMAIL_PATTERN.test(email)) {
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
    const result = await signIn('credentials', {
      email,
      password,
      callbackUrl: '/',
      redirect: false,
    });

    if (!result?.ok) {
      return {
        error: GENERIC_LOGIN_ERROR,
        field: 'email',
        attempt: previousState.attempt + 1,
      };
    }

    window.location.assign(result.url ?? '/');
    return { error: null, field: null, attempt: previousState.attempt };
  } catch {
    return {
      error: GENERIC_LOGIN_ERROR,
      field: 'email',
      attempt: previousState.attempt + 1,
    };
  }
}
