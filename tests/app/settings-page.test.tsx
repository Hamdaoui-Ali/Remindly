import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsPage } from '@/components/settings/settings-page';

const settings = {
  notificationEmail: 'owner@example.com',
  timezone: 'Africa/Casablanca',
  defaultAlertTime: '09:00',
  protectedAccess: true as const,
};

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('SettingsPage', () => {
  it('shows protected access as read-only status', () => {
    render(<SettingsPage settings={settings} />);

    expect(screen.getByText(/protected access/i)).toBeVisible();
    expect(screen.getByText(/enabled/i)).toBeVisible();
    expect(screen.queryByRole('textbox', { name: /password/i })).not.toBeInTheDocument();
  });

  it('saves valid edits and shows inline success feedback', async () => {
    const request = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ settings: { ...settings, timezone: 'Europe/London' } }),
    });
    vi.stubGlobal('fetch', request);
    const user = userEvent.setup();
    render(<SettingsPage settings={settings} />);

    await user.clear(screen.getByLabelText('Timezone'));
    await user.type(screen.getByLabelText('Timezone'), 'Europe/London');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/settings', expect.objectContaining({ method: 'PATCH' })));
    expect(await screen.findByText(/settings saved/i)).toBeVisible();
  });

  it('preserves invalid edits, reports the field, and lets Cancel restore loaded values', async () => {
    const user = userEvent.setup();
    render(<SettingsPage settings={settings} />);
    const email = screen.getByLabelText('Notification email');

    await user.clear(email);
    await user.type(email, 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(screen.getByText(/enter a valid email/i)).toBeVisible();
    expect(email).toHaveValue('not-an-email');
    expect(email).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(email).toHaveValue('owner@example.com');
    expect(screen.queryByText(/enter a valid email/i)).not.toBeInTheDocument();
  });
});
