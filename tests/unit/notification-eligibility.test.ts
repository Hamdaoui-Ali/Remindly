import { describe, expect, it } from 'vitest';

import { isCurrentAlertEligible } from '@/server/notifications/eligibility';

const valid = {
  reminderStatus: 'ACTIVE' as const,
  alertEnabled: true,
  email: 'owner@example.com',
  emailVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
  notificationScheduleVersion: 2,
  alertScheduleVersion: 2,
  notificationScheduledFor: new Date('2026-08-20T08:00:00.000Z'),
  alertScheduledFor: new Date('2026-08-20T08:00:00.000Z'),
};

describe('isCurrentAlertEligible', () => {
  it('accepts an active enabled alert with verified recipient and matching schedule', () => {
    expect(isCurrentAlertEligible(valid)).toBe(true);
  });

  it.each([
    ['inactive reminder', { reminderStatus: 'DONE' as const }],
    ['disabled alert', { alertEnabled: false }],
    ['missing email', { email: null }],
    ['unverified email', { emailVerifiedAt: null }],
    ['stale version', { notificationScheduleVersion: 1 }],
    ['stale timestamp', { notificationScheduledFor: new Date('2026-08-20T09:00:00.000Z') }],
  ])('rejects a %s', (_reason, change) => {
    expect(isCurrentAlertEligible({ ...valid, ...change })).toBe(false);
  });
});
