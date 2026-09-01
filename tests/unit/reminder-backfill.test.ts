import { describe, expect, it } from 'vitest';
import {
  buildLegacyBackfillPlan,
  evaluateBackfillReport,
  type LegacyBackfillNotification,
  type LegacyBackfillReminder,
} from '@/server/reminders/backfill';

const reminder: LegacyBackfillReminder = {
  id: 'reminder-1',
  endDate: new Date('2026-09-10T00:00:00.000Z'),
  alertAt: new Date('2026-09-07T08:00:00.000Z'),
  alertLeadDays: 3,
  userId: 'profile-1',
  status: 'ACTIVE',
};

function notification(overrides: Partial<LegacyBackfillNotification> = {}): LegacyBackfillNotification {
  return {
    id: 'notification-1',
    reminderId: reminder.id,
    scheduledFor: reminder.alertAt,
    status: 'PENDING',
    reminderAlertId: null,
    scheduleVersion: null,
    ...overrides,
  };
}

describe('legacy reminder backfill', () => {
  it('converts one legacy reminder into a version-one alert and due timestamp', () => {
    const plan = buildLegacyBackfillPlan({
      reminder,
      timezone: 'Africa/Casablanca',
      notifications: [notification()],
      alertId: 'alert-1',
    });

    expect(plan.dueAt).not.toBeNull();
    expect(plan.dueAt!.toISOString()).toBe('2026-09-10T22:59:00.000Z');
    expect(plan.alert).toEqual({
      id: 'alert-1',
      reminderId: reminder.id,
      scheduledFor: reminder.alertAt,
      offsetMinutes: 5219,
      scheduleVersion: 1,
    });
    expect(plan.notificationUpdates).toEqual([{
      id: 'notification-1',
      reminderAlertId: 'alert-1',
      scheduleVersion: 1,
    }]);
    expect(plan.issues).toEqual([]);
  });

  it('links an existing sent notification without changing its delivery history', () => {
    const sent = notification({
      status: 'SENT',
      scheduleVersion: 1,
      reminderAlertId: 'old-alert',
    });

    const plan = buildLegacyBackfillPlan({
      reminder,
      timezone: 'UTC',
      notifications: [sent],
      alertId: 'alert-1',
    });

    expect(plan.notificationUpdates).toEqual([{
      id: sent.id,
      reminderAlertId: 'alert-1',
      scheduleVersion: 1,
    }]);
    expect(sent.status).toBe('SENT');
  });

  it('reports a missing owner instead of producing an apply plan', () => {
    const plan = buildLegacyBackfillPlan({
      reminder: { ...reminder, userId: null },
      timezone: 'UTC',
      notifications: [notification()],
      alertId: 'alert-1',
    });

    expect(plan.alert).toBeNull();
    expect(plan.notificationUpdates).toEqual([]);
    expect(plan.issues).toContain('missing_owner');
  });

  it('reports a missing current notification', () => {
    const plan = buildLegacyBackfillPlan({
      reminder,
      timezone: 'UTC',
      notifications: [],
      alertId: 'alert-1',
    });

    expect(plan.notificationCreate).toMatchObject({
      id: expect.any(String),
      reminderId: reminder.id,
      reminderAlertId: 'alert-1',
      scheduledFor: reminder.alertAt,
      scheduleVersion: 1,
      channel: 'EMAIL',
      status: 'PENDING',
    });
    expect(plan.issues).toEqual([]);
  });

  it('fails cutover verification when counts or integrity checks do not reconcile', () => {
    expect(() => evaluateBackfillReport({
      remindersScanned: 2,
      remindersConverted: 1,
      alertsCreated: 1,
      notificationsLinked: 1,
      notificationsCreated: 0,
      alreadyMigrated: 0,
      missingOwners: 0,
      missingNotifications: 0,
      mismatchedNotifications: 1,
      invalidReminders: 0,
    })).toThrow('Backfill verification failed');

    expect(evaluateBackfillReport({
      remindersScanned: 1,
      remindersConverted: 1,
      alertsCreated: 1,
      notificationsLinked: 1,
      notificationsCreated: 0,
      alreadyMigrated: 0,
      missingOwners: 0,
      missingNotifications: 0,
      mismatchedNotifications: 0,
      invalidReminders: 0,
    })).toEqual({ ready: true, failures: [] });
  });
});
