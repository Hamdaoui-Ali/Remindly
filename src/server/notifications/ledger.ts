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
  const id = crypto.randomUUID();
  return new NotificationRepository(tx).createPending({
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
