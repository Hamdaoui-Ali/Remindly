import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AuthFeedback } from '@/components/auth/auth-feedback';
import { AuthField } from '@/components/auth/auth-field';
import { AuthShell } from '@/components/auth/auth-shell';

describe('auth components', () => {
  it('renders the shared auth shell and footer', () => {
    render(
      <AuthShell title="Test title" description="Test description" labelledBy="test-title" footer={<a href="/login">Sign in</a>}>
        <input aria-label="Test field" />
      </AuthShell>,
    );

    expect(screen.getByRole('main')).toHaveAttribute('aria-labelledby', 'test-title');
    expect(screen.getByRole('heading', { name: 'Test title' })).toBeInTheDocument();
    expect(screen.getByText('Test description')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  it('renders generic error and neutral success feedback with accessible roles', () => {
    render(
      <AuthFeedback error="Try again" message="Check your inbox" errorId="error" messageId="message" />,
    );

    expect(screen.getByRole('alert')).toHaveAttribute('id', 'error');
    expect(screen.getByRole('alert')).toHaveTextContent('Try again');
    expect(screen.getByRole('status')).toHaveAttribute('id', 'message');
    expect(screen.getByRole('status')).toHaveTextContent('Check your inbox');
  });

  it('renders a labeled input while preserving input attributes', () => {
    render(<AuthField id="email" label="Email" type="email" autoComplete="email" />);

    expect(screen.getByLabelText('Email')).toHaveAttribute('id', 'email');
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email');
  });
});
