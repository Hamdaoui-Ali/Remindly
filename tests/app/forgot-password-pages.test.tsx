import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ForgotPasswordPage from '@/app/forgot-password/page';
import ResetPasswordPage from '@/app/reset-password/page';

describe('password recovery pages', () => {
  it('exposes the recovery form and sign-in path', () => {
    render(<ForgotPasswordPage />);

    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByRole('link', { name: /Back to sign in/ })).toHaveAttribute('href', '/login');
  });

  it('exposes the new-password form', () => {
    render(<ResetPasswordPage />);

    expect(screen.getByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument();
    expect(screen.getByLabelText('New password')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText('Confirm password')).toHaveAttribute('autocomplete', 'new-password');
  });
});
