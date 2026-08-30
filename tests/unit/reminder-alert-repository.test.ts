import { describe, expect, it, vi } from 'vitest';

import {
  cancelObsoleteUnsentNotifications,
  createAlertsWithNotifications,
} from '@/server/reminders/alert-repository';

function fakeTransaction() {
  return {
    reminderAlert: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...data,
        id: data.id,
      })),
    },
    notification: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...data,
        id: data.id,
      })),
      updateMany: vi.fn(async () => ({ count: 2 })),
    },
  };
}

describe('alert-linked reminder persistence', () => {
  it('creates one versioned alert and notification per resolved schedule', async () => {
    const tx = fakeTransaction();
    const rows = await createAlertsWithNotifications(tx as never, 'reminder-1', [
      { scheduledFor: new Date('2026-08-20T08:00:00.000Z'), offsetMinutes: 1440 },
      { scheduledFor: new Date('2026-08-22T08:00:00.000Z'), offsetMinutes: null },
    ]);

    expect(rows.alerts).toHaveLength(2);
    expect(rows.notifications).toHaveLength(2);
    expect(tx.reminderAlert.create).toHaveBeenCalledTimes(2);
    expect(tx.notification.create).toHaveBeenCalledTimes(2);
    expect(tx.notification.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({
        reminderAlertId: rows.alerts[0]?.id,
        reminderId: 'reminder-1',
        scheduleVersion: 1,
        scheduledFor: new Date('2026-08-20T08:00:00.000Z'),
      }),
    }));
  });

  it('cancels only pending and failed notifications for obsolete alerts', async () => {
    const tx = fakeTransaction();

    await cancelObsoleteUnsentNotifications(tx as never, ['alert-1', 'alert-2']);

    expect(tx.notification.updateMany).toHaveBeenCalledWith({
      where: {
        reminderAlertId: { in: ['alert-1', 'alert-2'] },
        status: { in: ['PENDING', 'FAILED'] },
      },
      data: { status: 'CANCELLED' },
    });
  });
});
