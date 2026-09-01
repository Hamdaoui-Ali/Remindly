'use client';

import { useActionState, useRef } from 'react';
import { resetPasswordAction, type PasswordRecoveryState } from '@/app/forgot-password/actions';
import { AuthField } from '@/components/auth/auth-field';
import { AuthFeedback } from '@/components/auth/auth-feedback';
import { PasswordRecoveryShell } from '@/components/auth/password-recovery-shell';
import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { useAuthFieldFocus } from '@/components/auth/use-auth-field-focus';

const initialState: PasswordRecoveryState = { error: null, message: null, field: null, attempt: 0 };

export default function ResetPasswordPage() {
  const [state, formAction] = useActionState(resetPasswordAction, initialState);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  useAuthFieldFocus(state.field, state.attempt, { password: passwordRef, confirmPassword: confirmRef });

  return (
    <PasswordRecoveryShell
      title="Choose a new password"
      description="Use at least eight characters for your new password."
      labelledBy="reset-password-title"
    >
        <form action={formAction} noValidate>
          <AuthField inputRef={passwordRef} id="password" label="New password" name="password" type="password" autoComplete="new-password" aria-invalid={state.field === 'password'} aria-describedby={state.error ? 'reset-password-error' : undefined} />
          <AuthField inputRef={confirmRef} id="confirmPassword" label="Confirm password" name="confirmPassword" type="password" autoComplete="new-password" aria-invalid={state.field === 'confirmPassword'} aria-describedby={state.error ? 'reset-password-error' : undefined} />
          <AuthFeedback error={state.error} errorId="reset-password-error" message={state.message} messageId="reset-password-message" />
          <AuthSubmitButton pendingLabel="Updating password..." label="Update password" />
        </form>
    </PasswordRecoveryShell>
  );
}
