import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireUser } = vi.hoisted(() => ({
  requireUser: vi.fn(async () => ({ id: 'user-a', email: 'owner@example.com' })),
}));

vi.mock('@/server/auth/require-user', () => ({ requireUser }));

import { GET, PATCH } from '@/app/api/settings/route';
import { ProfileService } from '@/server/profile/service';

const publicSettings = {
  email: 'owner@example.com',
  emailVerified: true,
  timezone: 'Africa/Casablanca',
  defaultAlertTime: '09:00',
};

beforeEach(() => {
  vi.restoreAllMocks();
  requireUser.mockClear();
});

describe('/api/settings', () => {
  it('does not read settings when owner authentication fails', async () => {
    const getSettings = vi.spyOn(ProfileService.prototype, 'getSettings');
    requireUser.mockRejectedValueOnce(new Error('NEXT_REDIRECT'));

    await expect(GET()).rejects.toThrow('NEXT_REDIRECT');

    expect(getSettings).not.toHaveBeenCalled();
  });

  it('authenticates GET and returns only public owner settings', async () => {
    vi.spyOn(ProfileService.prototype, 'getSettings').mockResolvedValue(publicSettings);

    const response = await GET();
    const body = await response.json();

    expect(requireUser).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(body).toEqual({ settings: publicSettings });
    expect(JSON.stringify(body)).not.toMatch(/password|secret|hash/i);
  });

  it('rejects invalid PATCH input before changing settings', async () => {
    const update = vi.spyOn(ProfileService.prototype, 'updateSettings');

    const response = await PATCH(new Request('http://localhost/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ timezone: 'Not/A-Timezone' }),
    }));

    expect(requireUser).toHaveBeenCalledOnce();
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid settings input',
      fields: { timezone: expect.any(Array) },
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('authenticates PATCH and returns sanitized updated settings', async () => {
    vi.spyOn(ProfileService.prototype, 'updateSettings').mockResolvedValue({
      ...publicSettings,
      defaultAlertTime: '10:30',
    });

    const response = await PATCH(new Request('http://localhost/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ defaultAlertTime: '10:30' }),
    }));

    expect(requireUser).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ settings: { ...publicSettings, defaultAlertTime: '10:30' } });
  });
});
