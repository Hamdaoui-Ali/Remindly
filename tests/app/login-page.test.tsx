import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { signInWithPassword, push } = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({ auth: { signInWithPassword } }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

import LoginPage from '@/app/login/page';

beforeEach(() => {
  signInWithPassword.mockReset();
  push.mockReset();
});

describe('LoginPage', () => {
  it('navigates to the dashboard after confirmed sign-in', async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: { email_confirmed_at: '2026-09-28T10:00:00.000Z' } },
      error: null,
    });
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
  });
});
