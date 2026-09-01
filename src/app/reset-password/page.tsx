'use client';

import Link from 'next/link';
import { useActionState, useRef } from 'react';
import { resetPasswordAction, type PasswordRecoveryState } from '@/app/forgot-password/actions';
import { AuthFeedback } from '@/components/auth/auth-feedback';
import { AuthShell } from '@/components/auth/auth-shell';
import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { useAuthFieldFocus } from '@/components/auth/use-auth-field-focus';

const initialState: PasswordRecoveryState = { error: null, message: null, field: null, attempt: 0 };

export default function ResetPasswordPage() {
  const [state, formAction] = useActionState(resetPasswordAction, initialState);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  useAuthFieldFocus(state.field, state.attempt, { password: passwordRef, confirmPassword: confirmRef });

  return (
    <AuthShell
      title="Choose a new password"
      description="Use at least eight characters for your new password."
      labelledBy="reset-password-title"
      footer={<p><Link href="/login">Back to sign in</Link></p>}
    >
        <form action={formAction} noValidate>
          <div className="login-field">
            <label htmlFor="password">New password</label>
            <input ref={passwordRef} id="password" name="password" type="password" autoComplete="new-password" aria-invalid={state.field === 'password'} aria-describedby={state.error ? 'reset-password-error' : undefined} />
          </div>
          <div className="login-field">
            <label htmlFor="confirmPassword">Confirm password</label>
            <input ref={confirmRef} id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" aria-invalid={state.field === 'confirmPassword'} aria-describedby={state.error ? 'reset-password-error' : undefined} />
          </div>
          <AuthFeedback error={state.error} errorId="reset-password-error" message={state.message} messageId="reset-password-message" />
          <AuthSubmitButton pendingLabel="Updating password..." label="Update password" />
        </form>
    </AuthShell>
  );
}
