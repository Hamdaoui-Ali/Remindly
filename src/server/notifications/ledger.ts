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
  return new NotificationRepository(tx).createPending({
    reminderId,
    scheduledFor,
    channel: 'EMAIL',
    status: 'PENDING',
    idempotencyKey: crypto.randomUUID(),
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
