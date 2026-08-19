import type { Notification, Prisma } from '@/generated/prisma/client';
import { NotificationRepository } from './repository';

/**
 * Lifecycle-owned notification policy. Delivery and retry policy belongs to
 * the notification processor, not this ledger.
 */
export function createPendingEmailNotification(
  tx: Prisma.TransactionClient,
  reminderId: string,
  scheduledFor: Date,
): Promise<Notification> {
  return ensurePendingEmailNotification(tx, reminderId, scheduledFor);
}

async function ensurePendingEmailNotification(
  tx: Prisma.TransactionClient,
  reminderId: string,
  scheduledFor: Date,
): Promise<Notification> {
  const notifications = new NotificationRepository(tx);
  const existing = await notifications.findForReminderSchedule(reminderId, scheduledFor);
  if (existing) {
    if (existing.status !== 'CANCELLED') return existing;
    const reactivated = await notifications.reactivateCancelled(existing.id);
    if (reactivated) return reactivated;
    const current = await notifications.findForReminderSchedule(reminderId, scheduledFor);
    if (current) return current;
  }

  const id = crypto.randomUUID();
  return notifications.createPending({
    id,
    reminderId,
    scheduledFor,
    channel: 'EMAIL',
    status: 'PENDING',
    idempotencyKey: id,
  });
}

export function cancelPendingEmailNotifications(
  tx: Prisma.TransactionClient,
  reminderId: string,
): Promise<number> {
  return new NotificationRepository(tx).cancelPendingForReminder(reminderId, {
    expectedStatus: 'PENDING',
    status: 'CANCELLED',
  });
}
