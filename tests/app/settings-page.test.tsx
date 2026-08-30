import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsPage } from '@/components/settings/settings-page';

const settings = {
  email: 'owner@example.com',
  emailVerified: true,
  timezone: 'Africa/Casablanca',
  defaultAlertTime: '09:00',
};

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('SettingsPage', () => {
  it('shows protected access as read-only status', () => {
    render(<SettingsPage settings={settings} />);

    expect(screen.getByText(/protected access/i)).toBeVisible();
    expect(screen.getByText(/verified/i)).toBeVisible();
    expect(screen.getByLabelText('Verified email')).toHaveValue('owner@example.com');
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
    const timezone = screen.getByLabelText('Timezone');

    await user.clear(timezone);
    await user.type(timezone, 'Not/A-Timezone');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(screen.getByText(/enter a valid iana timezone/i)).toBeVisible();
    expect(timezone).toHaveValue('Not/A-Timezone');
    expect(timezone).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(timezone).toHaveValue('Africa/Casablanca');
    expect(screen.queryByText(/enter a valid iana timezone/i)).not.toBeInTheDocument();
  });
});
