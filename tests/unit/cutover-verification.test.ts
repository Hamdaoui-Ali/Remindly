import { describe, expect, it } from 'vitest';

import {
  evaluateCutoverVerification,
  type CutoverVerificationInput,
} from '@/server/reminders/cutover';

const readyReport: CutoverVerificationInput = {
  activeRemindersMissingOwners: 0,
  remindersMissingDueAt: 0,
  notificationsMissingAlerts: 0,
  notificationsMissingScheduleVersions: 0,
  alertsMissingCurrentNotifications: 0,
  legacyClaimableNotifications: 0,
};

describe('strict reminder cutover verification', () => {
  it('accepts a fully reconciled report', () => {
    expect(evaluateCutoverVerification(readyReport)).toEqual({ ready: true, failures: [] });
  });

  it('reports every failed readiness condition without exposing data', () => {
    const result = evaluateCutoverVerification({
      activeRemindersMissingOwners: 2,
      remindersMissingDueAt: 1,
      notificationsMissingAlerts: 3,
      notificationsMissingScheduleVersions: 4,
      alertsMissingCurrentNotifications: 5,
      legacyClaimableNotifications: 6,
    });

    expect(result).toEqual({
      ready: false,
      failures: [
        'active reminders are missing owners',
        'reminders are missing due timestamps',
        'notifications are missing alert links',
        'notifications are missing schedule versions',
        'alerts are missing current notifications',
        'legacy notifications remain claimable',
      ],
    });
  });
});
