'use client';

import { useActionState, useRef } from 'react';
import Link from 'next/link';

import { loginAction, type LoginState } from '@/app/login/actions';
import { AuthFeedback } from '@/components/auth/auth-feedback';
import { AuthShell } from '@/components/auth/auth-shell';
import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { useAuthFieldFocus } from '@/components/auth/use-auth-field-focus';

const initialState: LoginState = { error: null, field: null, attempt: 0 };

export default function LoginPage() {
  const [state, formAction] = useActionState(loginAction, initialState);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useAuthFieldFocus(state.field, state.attempt, { email: emailRef, password: passwordRef });

  return (
    <AuthShell
      title="Sign in"
      description="Access your private reminder workspace."
      labelledBy="login-title"
      footer={<><p><Link href="/forgot-password">Forgot your password?</Link></p><p><Link href="/register">Need an account? Create one</Link></p></>}
    >
        <form action={formAction} noValidate>
          <div className="login-field">
            <label htmlFor="email">Email</label>
            <input
              ref={emailRef}
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              autoFocus={state.field === 'email'}
              aria-invalid={state.field === 'email'}
              aria-describedby={state.error ? 'login-error' : undefined}
            />
          </div>

          <div className="login-field">
            <label htmlFor="password">Password</label>
            <input
              ref={passwordRef}
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              autoFocus={state.field === 'password'}
              aria-invalid={state.field === 'password'}
              aria-describedby={state.error ? 'login-error' : undefined}
            />
          </div>

          <AuthFeedback error={state.error} errorId="login-error" message={null} messageId="login-message" />
          <AuthSubmitButton pendingLabel="Signing in..." label="Sign in" />
        </form>
    </AuthShell>
  );
}
