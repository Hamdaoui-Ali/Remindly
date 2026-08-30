import { describe, expect, it, vi } from 'vitest';

import { ProfileService } from '@/server/profile/service';

const profile = {
  id: 'user-a',
  email: 'a@example.com',
  emailVerifiedAt: new Date('2026-08-30T10:00:00.000Z'),
  timezone: 'Africa/Casablanca',
  defaultAlertTime: '09:00',
};

function database() {
  return {
    userProfile: {
      findUnique: vi.fn().mockResolvedValue(profile),
      update: vi.fn().mockResolvedValue(profile),
    },
  };
}

describe('ProfileService', () => {
  it('returns the authenticated profile email and verification status', async () => {
    const db = database();
    const service = new ProfileService(db as never);

    await expect(service.getSettings('user-a')).resolves.toEqual({
      email: 'a@example.com',
      emailVerified: true,
      timezone: 'Africa/Casablanca',
      defaultAlertTime: '09:00',
    });
  });

  it('updates preferences without accepting a notification destination', async () => {
    const db = database();
    const service = new ProfileService(db as never);

    await expect(service.updateSettings('user-a', {
      timezone: 'Europe/Paris',
      notificationEmail: 'relay@example.com',
    } as never)).rejects.toThrow();
    expect(db.userProfile.update).not.toHaveBeenCalled();
  });

  it('updates only timezone and default alert time for the authenticated profile', async () => {
    const db = database();
    const service = new ProfileService(db as never);

    await service.updateSettings('user-a', { timezone: 'Europe/Paris', defaultAlertTime: '10:30' });

    expect(db.userProfile.update).toHaveBeenCalledWith({
      where: { id: 'user-a' },
      data: { timezone: 'Europe/Paris', defaultAlertTime: '10:30' },
    });
  });
});
