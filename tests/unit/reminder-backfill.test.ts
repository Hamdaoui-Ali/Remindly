import {
  buildLegacyBackfillPlan,
  executeBackfillPlan,
  type BackfillWriter,
} from '@/server/reminders/backfill';

const dueDate = new Date('2026-09-15T09:00:00.000Z');
const scheduledFor = new Date('2026-09-12T08:00:00.000Z');

function legacyReminder(overrides: Partial<Parameters<typeof buildLegacyBackfillPlan>[0]['reminders'][number]> = {}) {
  return {
    id: 'reminder-a',
    userId: 'user-a',
    endDate: dueDate,
    alertTime: '09:00',
    alertAt: scheduledFor,
    status: 'ACTIVE' as const,
    ...overrides,
  };
}

function writerSpy(): BackfillWriter & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    updateReminder: async () => { calls.push('updateReminder'); },
    createAlert: async () => { calls.push('createAlert'); },
    createNotification: async () => { calls.push('createNotification'); },
    linkNotification: async () => { calls.push('linkNotification'); },
  };
}

describe('legacy reminder backfill', () => {
  it('converts one legacy reminder and links its current notification to version one', () => {
    const plan = buildLegacyBackfillPlan({
      reminders: [legacyReminder()],
      profiles: new Map([['user-a', { timezone: 'UTC' }]]),
      notifications: [{
        id: 'notification-a',
        reminderId: 'reminder-a',
        scheduledFor,
        status: 'PENDING',
        channel: 'EMAIL',
      }],
      alerts: [],
      defaultTimezone: 'UTC',
      idFactory: () => 'alert-a',
    });

    expect(plan.issues).toEqual([]);
    expect(plan.actions).toEqual([
      expect.objectContaining({ kind: 'updateReminder', reminderId: 'reminder-a', dueAt: dueDate }),
      expect.objectContaining({ kind: 'createAlert', alertId: 'alert-a', scheduleVersion: 1 }),
      expect.objectContaining({ kind: 'linkNotification', notificationId: 'notification-a', alertId: 'alert-a', scheduleVersion: 1 }),
    ]);
    expect(plan.counts).toMatchObject({ reminders: 1, alertsCreated: 1, notificationsLinked: 1 });
  });

  it('preserves an existing sent notification while linking it', () => {
    const plan = buildLegacyBackfillPlan({
      reminders: [legacyReminder()],
      profiles: new Map([['user-a', { timezone: 'UTC' }]]),
      notifications: [{ id: 'notification-a', reminderId: 'reminder-a', scheduledFor, status: 'SENT', channel: 'EMAIL' }],
      alerts: [],
      defaultTimezone: 'UTC',
      idFactory: () => 'alert-a',
    });

    expect(plan.actions).toContainEqual(expect.objectContaining({ kind: 'linkNotification', notificationId: 'notification-a' }));
    expect(plan.actions).not.toContainEqual(expect.objectContaining({ kind: 'cancelNotification' }));
  });

  it('reports active reminders without an owner and does not create actions for them', () => {
    const plan = buildLegacyBackfillPlan({
      reminders: [legacyReminder({ userId: null })],
      profiles: new Map(),
      notifications: [],
      alerts: [],
      defaultTimezone: 'UTC',
    });

    expect(plan.issues).toEqual([{ code: 'MISSING_OWNER', reminderId: 'reminder-a' }]);
    expect(plan.actions).toEqual([]);
  });

  it('does not call the writer during a dry run', async () => {
    const plan = buildLegacyBackfillPlan({
      reminders: [legacyReminder()],
      profiles: new Map([['user-a', { timezone: 'UTC' }]]),
      notifications: [],
      alerts: [],
      defaultTimezone: 'UTC',
      idFactory: () => 'alert-a',
    });
    const writer = writerSpy();

    await executeBackfillPlan(plan, writer, { dryRun: true });

    expect(writer.calls).toEqual([]);
  });
});
