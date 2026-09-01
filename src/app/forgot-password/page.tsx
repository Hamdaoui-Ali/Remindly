'use client';

import Link from 'next/link';
import { useActionState, useRef } from 'react';
import { forgotPasswordAction, type PasswordRecoveryState } from './actions';
import { AuthField } from '@/components/auth/auth-field';
import { AuthFeedback } from '@/components/auth/auth-feedback';
import { AuthShell } from '@/components/auth/auth-shell';
import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { useAuthFieldFocus } from '@/components/auth/use-auth-field-focus';

const initialState: PasswordRecoveryState = { error: null, message: null, field: null, attempt: 0 };

export default function ForgotPasswordPage() {
  const [state, formAction] = useActionState(forgotPasswordAction, initialState);
  const emailRef = useRef<HTMLInputElement>(null);

  useAuthFieldFocus(state.field, state.attempt, { email: emailRef });

  return (
    <AuthShell
      title="Reset your password"
      description="We’ll send a secure link to your account email."
      labelledBy="forgot-password-title"
      footer={<p><Link href="/login">Back to sign in</Link></p>}
    >
        <form action={formAction} noValidate>
          <AuthField inputRef={emailRef} id="email" label="Email" name="email" type="email" autoComplete="email" aria-invalid={state.field === 'email'} aria-describedby={state.error ? 'forgot-password-error' : undefined} />
          <AuthFeedback error={state.error} errorId="forgot-password-error" message={state.message} messageId="forgot-password-message" />
          <AuthSubmitButton pendingLabel="Sending link..." label="Send reset link" />
        </form>
    </AuthShell>
  );
}
