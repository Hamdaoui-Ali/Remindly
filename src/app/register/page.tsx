'use client';

import Link from 'next/link';
import { useActionState, useRef } from 'react';
import { registerAction, type RegisterState } from './actions';
import { AuthFeedback } from '@/components/auth/auth-feedback';
import { AuthShell } from '@/components/auth/auth-shell';
import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { useAuthFieldFocus } from '@/components/auth/use-auth-field-focus';

const initialState: RegisterState = { error: null, message: null, field: null, attempt: 0 };

export default function RegisterPage() {
  const [state, formAction] = useActionState(registerAction, initialState);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  useAuthFieldFocus(state.field, state.attempt, { email: emailRef, password: passwordRef, confirmPassword: confirmRef });

  return (
    <AuthShell
      title="Create your account"
      description="Keep your deadline reminders in one private workspace."
      labelledBy="register-title"
      footer={<p><Link href="/login">Already have an account? Sign in</Link></p>}
    >
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

          <AuthFeedback error={state.error} errorId="register-error" message={state.message} messageId="register-message" />
          <AuthSubmitButton pendingLabel="Creating account..." label="Create account" />
        </form>
    </AuthShell>
  );
}
