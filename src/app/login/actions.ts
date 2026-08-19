'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { signInOwner } from '@/auth';

const GENERIC_LOGIN_ERROR = 'Unable to sign in with those credentials.';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginState = {
  error: string | null;
  field: 'email' | 'password' | null;
  attempt: number;
};

export async function loginAction(
  previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const result = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!result.success) {
    const firstField = result.error.issues[0]?.path[0];

    return {
      error: GENERIC_LOGIN_ERROR,
      field: firstField === 'password' ? 'password' : 'email',
      attempt: previousState.attempt + 1,
    };
  }

  if (!(await signInOwner(result.data.email, result.data.password))) {
    return {
      error: GENERIC_LOGIN_ERROR,
      field: 'email',
      attempt: previousState.attempt + 1,
    };
  }

  redirect('/');
}
