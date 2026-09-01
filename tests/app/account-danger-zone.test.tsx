import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createBrowserSupabaseClient, signOut } = vi.hoisted(() => ({
  createBrowserSupabaseClient: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({ createBrowserSupabaseClient }));

import { AccountDangerZone } from '@/components/settings/account-danger-zone';

beforeEach(() => {
  vi.unstubAllGlobals();
  createBrowserSupabaseClient.mockReset().mockReturnValue({ auth: { signOut } });
  signOut.mockReset();
});

describe('AccountDangerZone', () => {
  it('requires confirmation before deleting the account', async () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    render(<AccountDangerZone />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Delete account' }));

    expect(screen.getByText(/cannot be undone/i)).toBeVisible();
    expect(request).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Keep my account' }));
    expect(screen.getByRole('button', { name: 'Delete account' })).toBeVisible();
  });

  it('deletes, signs out, and redirects after confirmation', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', request);
    signOut.mockResolvedValue({ error: null });
    const redirect = vi.fn();
    render(<AccountDangerZone onDeleted={redirect} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Delete account' }));
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));

    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/account', { method: 'DELETE' }));
    expect(signOut).toHaveBeenCalledOnce();
    expect(redirect).toHaveBeenCalledOnce();
  });

  it('reports recent-auth or server failures without signing out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    render(<AccountDangerZone />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Delete account' }));
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/sign in again/i);
    expect(signOut).not.toHaveBeenCalled();
  });
});
