'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';

import { loginAction, type LoginState } from '@/app/login/actions';

const initialState: LoginState = {
  error: null,
  field: null,
  attempt: 0,
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Signing in...' : 'Sign in'}
    </button>
  );
}

export default function LoginPage() {
  const [state, formAction] = useActionState(loginAction, initialState);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.field === 'email') {
      emailRef.current?.focus();
    } else if (state.field === 'password') {
      passwordRef.current?.focus();
    }
  }, [state.attempt, state.field]);

  return (
    <main className="login-shell" aria-labelledby="login-title">
      <section className="login-panel">
        <p className="wordmark">Remindly</p>
        <h1 id="login-title">Sign in</h1>
        <p>Access your private reminder workspace.</p>

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

          {state.error ? (
            <p id="login-error" className="login-error" role="alert">
              {state.error}
            </p>
          ) : null}

          <SubmitButton />
        </form>
        <p><Link href="/register">Need an account? Create one</Link></p>
      </section>
    </main>
  );
}
