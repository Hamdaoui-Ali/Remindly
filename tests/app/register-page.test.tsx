import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RegisterPage from '@/app/register/page';

describe('RegisterPage', () => {
  it('exposes an accessible registration form and sign-in path', () => {
    render(<RegisterPage />);

    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText('Confirm password')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Already have an account/ })).toHaveAttribute('href', '/login');
  });
});
