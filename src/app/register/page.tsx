'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { registerAction, type RegisterState } from './actions';

const initialState: RegisterState = { error: null, message: null, field: null, attempt: 0 };

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending}>{pending ? 'Creating account...' : 'Create account'}</button>;
}

export default function RegisterPage() {
  const [state, formAction] = useActionState(registerAction, initialState);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const field = state.field === 'email' ? emailRef : state.field === 'password' ? passwordRef : confirmRef;
    field.current?.focus();
  }, [state.attempt, state.field]);

  return (
    <main className="login-shell" aria-labelledby="register-title">
      <section className="login-panel">
        <p className="wordmark">Remindly</p>
        <h1 id="register-title">Create your account</h1>
        <p>Keep your deadline reminders in one private workspace.</p>

        <form action={formAction} noValidate>
          <div className="login-field">
            <label htmlFor="email">Email</label>
            <input ref={emailRef} id="email" name="email" type="email" autoComplete="email" aria-invalid={state.field === 'email'} aria-describedby={state.error ? 'register-error' : undefined} />
          </div>
          <div className="login-field">
            <label htmlFor="password">Password</label>
            <input ref={passwordRef} id="password" name="password" type="password" autoComplete="new-password" aria-invalid={state.field === 'password'} aria-describedby={state.error ? 'register-error' : undefined} />
          </div>
          <div className="login-field">
            <label htmlFor="confirmPassword">Confirm password</label>
            <input ref={confirmRef} id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" aria-invalid={state.field === 'confirmPassword'} aria-describedby={state.error ? 'register-error' : undefined} />
          </div>

          {state.error ? <p id="register-error" className="login-error" role="alert">{state.error}</p> : null}
          {state.message ? <p id="register-message" role="status">{state.message}</p> : null}
          <SubmitButton />
        </form>
        <p><Link href="/login">Already have an account? Sign in</Link></p>
      </section>
    </main>
  );
}
