import { prisma } from '@/server/db/client';
import { NotificationRepository } from './repository';

export function reconcileMissingPendingNotifications(now: Date): Promise<number> {
  return new NotificationRepository(prisma).reconcileMissingPending({
    now,
    reminderStatus: 'ACTIVE',
    channel: 'EMAIL',
    notificationStatus: 'PENDING',
  });
}
