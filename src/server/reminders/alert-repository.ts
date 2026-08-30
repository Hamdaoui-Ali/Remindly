import type { Notification, Prisma, ReminderAlert } from '@/generated/prisma/client';
import type { ResolvedReminderAlert } from './alerts';

export interface AlertLedgerResult {
  alerts: ReminderAlert[];
  notifications: Notification[];
}

export async function createAlertsWithNotifications(
  tx: Prisma.TransactionClient,
  reminderId: string,
  resolvedAlerts: ResolvedReminderAlert[],
  scheduleVersion = 1,
): Promise<AlertLedgerResult> {
  const alerts: ReminderAlert[] = [];
  const notifications: Notification[] = [];

  for (const resolved of resolvedAlerts) {
    const alertId = crypto.randomUUID();
    const notificationId = crypto.randomUUID();
    const alert = await tx.reminderAlert.create({
      data: {
        id: alertId,
        reminderId,
        scheduledFor: resolved.scheduledFor,
        offsetMinutes: resolved.offsetMinutes,
        scheduleVersion,
        channel: 'EMAIL',
        enabled: true,
      },
    });
    const notification = await tx.notification.create({
      data: {
        id: notificationId,
        reminderId,
        reminderAlertId: alert.id,
        scheduledFor: alert.scheduledFor,
        scheduleVersion: alert.scheduleVersion,
        channel: alert.channel,
        status: 'PENDING',
        idempotencyKey: notificationId,
      },
    });
    alerts.push(alert);
    notifications.push(notification);
  }

  return { alerts, notifications };
}

export function cancelObsoleteUnsentNotifications(
  tx: Prisma.TransactionClient,
  reminderAlertIds: string[],
): Promise<{ count: number }> {
  if (reminderAlertIds.length === 0) return Promise.resolve({ count: 0 });
  return tx.notification.updateMany({
    where: {
      reminderAlertId: { in: reminderAlertIds },
      status: { in: ['PENDING', 'FAILED'] },
    },
    data: { status: 'CANCELLED' },
  });
}
