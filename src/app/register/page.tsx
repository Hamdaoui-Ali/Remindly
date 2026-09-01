'use client';

import Link from 'next/link';
import { useActionState, useRef } from 'react';
import { registerAction, type RegisterState } from './actions';
import { AuthField } from '@/components/auth/auth-field';
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
          <AuthField inputRef={emailRef} id="email" label="Email" name="email" type="email" autoComplete="email" aria-invalid={state.field === 'email'} aria-describedby={state.error ? 'register-error' : undefined} />
          <AuthField inputRef={passwordRef} id="password" label="Password" name="password" type="password" autoComplete="new-password" aria-invalid={state.field === 'password'} aria-describedby={state.error ? 'register-error' : undefined} />
          <AuthField inputRef={confirmRef} id="confirmPassword" label="Confirm password" name="confirmPassword" type="password" autoComplete="new-password" aria-invalid={state.field === 'confirmPassword'} aria-describedby={state.error ? 'register-error' : undefined} />

          <AuthFeedback error={state.error} errorId="register-error" message={state.message} messageId="register-message" />
          <AuthSubmitButton pendingLabel="Creating account..." label="Create account" />
        </form>
    </AuthShell>
  );
}
