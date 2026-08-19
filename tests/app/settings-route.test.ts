import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireOwner } = vi.hoisted(() => ({
  requireOwner: vi.fn(async () => ({ email: 'owner@example.com' })),
}));

vi.mock('@/server/auth/require-owner', () => ({ requireOwner }));

import { GET, PATCH } from '@/app/api/settings/route';
import { SettingsService } from '@/server/settings/service';

const publicSettings = {
  notificationEmail: 'owner@example.com',
  timezone: 'Africa/Casablanca',
  defaultAlertTime: '09:00',
  protectedAccess: true as const,
};

beforeEach(() => {
  vi.restoreAllMocks();
  requireOwner.mockClear();
});

describe('/api/settings', () => {
  it('does not read settings when owner authentication fails', async () => {
    const getSettings = vi.spyOn(SettingsService.prototype, 'getSettings');
    requireOwner.mockRejectedValueOnce(new Error('NEXT_REDIRECT'));

    await expect(GET()).rejects.toThrow('NEXT_REDIRECT');

    expect(getSettings).not.toHaveBeenCalled();
  });

  it('authenticates GET and returns only public owner settings', async () => {
    vi.spyOn(SettingsService.prototype, 'getSettings').mockResolvedValue(publicSettings);

    const response = await GET();
    const body = await response.json();

    expect(requireOwner).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(body).toEqual({ settings: publicSettings });
    expect(JSON.stringify(body)).not.toMatch(/password|secret|hash/i);
  });

  it('rejects invalid PATCH input before changing settings', async () => {
    const update = vi.spyOn(SettingsService.prototype, 'updateSettings');

    const response = await PATCH(new Request('http://localhost/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ timezone: 'Not/A-Timezone' }),
    }));

    expect(requireOwner).toHaveBeenCalledOnce();
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid settings input',
      fields: { timezone: expect.any(Array) },
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('authenticates PATCH and returns sanitized updated settings', async () => {
    vi.spyOn(SettingsService.prototype, 'updateSettings').mockResolvedValue({
      ...publicSettings,
      defaultAlertTime: '10:30',
    });

    const response = await PATCH(new Request('http://localhost/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ defaultAlertTime: '10:30' }),
    }));

    expect(requireOwner).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ settings: { ...publicSettings, defaultAlertTime: '10:30' } });
  });
});
