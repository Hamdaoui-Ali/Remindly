import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createBrowserSupabaseClient, signOut, push } = vi.hoisted(() => ({
  createBrowserSupabaseClient: vi.fn(),
  signOut: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({ createBrowserSupabaseClient }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

import { SignOutButton } from '@/components/layout/sign-out-button';

beforeEach(() => {
  createBrowserSupabaseClient.mockReset().mockReturnValue({ auth: { signOut } });
  signOut.mockReset();
  push.mockReset();
});

describe('SignOutButton', () => {
  it('signs out and returns to login', async () => {
    signOut.mockResolvedValue({ error: null });
    render(<SignOutButton onSignedOut={() => push('/login')} />);

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(signOut).toHaveBeenCalledOnce();
    expect(push).toHaveBeenCalledWith('/login');
  });

  it('reports a generic failure without redirecting', async () => {
    signOut.mockResolvedValue({ error: new Error('network details') });
    render(<SignOutButton />);

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Unable to sign out. Please try again.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('network details');
    expect(push).not.toHaveBeenCalled();
  });
});
