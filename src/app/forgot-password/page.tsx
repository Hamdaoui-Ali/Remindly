'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { forgotPasswordAction, type PasswordRecoveryState } from './actions';

const initialState: PasswordRecoveryState = { error: null, message: null, field: null, attempt: 0 };

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending}>{pending ? 'Sending link...' : 'Send reset link'}</button>;
}

export default function ForgotPasswordPage() {
  const [state, formAction] = useActionState(forgotPasswordAction, initialState);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.field === 'email') emailRef.current?.focus();
  }, [state.attempt, state.field]);

  return (
    <main className="login-shell" aria-labelledby="forgot-password-title">
      <section className="login-panel">
        <p className="wordmark">Remindly</p>
        <h1 id="forgot-password-title">Reset your password</h1>
        <p>We’ll send a secure link to your account email.</p>
        <form action={formAction} noValidate>
          <div className="login-field">
            <label htmlFor="email">Email</label>
            <input ref={emailRef} id="email" name="email" type="email" autoComplete="email" aria-invalid={state.field === 'email'} aria-describedby={state.error ? 'forgot-password-error' : undefined} />
          </div>
          {state.error ? <p id="forgot-password-error" className="login-error" role="alert">{state.error}</p> : null}
          {state.message ? <p id="forgot-password-message" role="status">{state.message}</p> : null}
          <SubmitButton />
        </form>
        <p><Link href="/login">Back to sign in</Link></p>
      </section>
    </main>
  );
}
