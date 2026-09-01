'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { resetPasswordAction, type PasswordRecoveryState } from '@/app/forgot-password/actions';

const initialState: PasswordRecoveryState = { error: null, message: null, field: null, attempt: 0 };

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending}>{pending ? 'Updating password...' : 'Update password'}</button>;
}

export default function ResetPasswordPage() {
  const [state, formAction] = useActionState(resetPasswordAction, initialState);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const field = state.field === 'confirmPassword' ? confirmRef : passwordRef;
    field.current?.focus();
  }, [state.attempt, state.field]);

  return (
    <main className="login-shell" aria-labelledby="reset-password-title">
      <section className="login-panel">
        <p className="wordmark">Remindly</p>
        <h1 id="reset-password-title">Choose a new password</h1>
        <p>Use at least eight characters for your new password.</p>
        <form action={formAction} noValidate>
          <div className="login-field">
            <label htmlFor="password">New password</label>
            <input ref={passwordRef} id="password" name="password" type="password" autoComplete="new-password" aria-invalid={state.field === 'password'} aria-describedby={state.error ? 'reset-password-error' : undefined} />
          </div>
          <div className="login-field">
            <label htmlFor="confirmPassword">Confirm password</label>
            <input ref={confirmRef} id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" aria-invalid={state.field === 'confirmPassword'} aria-describedby={state.error ? 'reset-password-error' : undefined} />
          </div>
          {state.error ? <p id="reset-password-error" className="login-error" role="alert">{state.error}</p> : null}
          {state.message ? <p id="reset-password-message" role="status">{state.message}</p> : null}
          <SubmitButton />
        </form>
        <p><Link href="/login">Back to sign in</Link></p>
      </section>
    </main>
  );
}
