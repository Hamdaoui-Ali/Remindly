import type {
  Notification,
  Prisma,
  PrismaClient,
} from '@/generated/prisma/client';

export type NotificationDatabase = PrismaClient | Prisma.TransactionClient;

export interface CreatePendingNotification {
  reminderId: string;
  scheduledFor: Date;
  idempotencyKey: string;
}

export interface SentNotification {
  providerMessageId?: string;
  sentAt: Date;
}

export interface FailedNotification {
  lastError: string;
  nextAttemptAt: Date | null;
}

export class NotificationRepository {
  constructor(private readonly db: NotificationDatabase) {}

  createPending(input: CreatePendingNotification): Promise<Notification> {
    return this.db.notification.create({
      data: { ...input, channel: 'EMAIL', status: 'PENDING' },
    });
  }

  async cancelPendingForReminder(reminderId: string): Promise<number> {
    const result = await this.db.notification.updateMany({
      where: { reminderId, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
    return result.count;
  }

  findDueCandidates(now: Date, limit: number): Promise<Notification[]> {
    return this.db.notification.findMany({
      where: {
        OR: [
          { status: 'PENDING', scheduledFor: { lte: now } },
          { status: 'FAILED', nextAttemptAt: { lte: now } },
        ],
      },
      orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }],
      take: limit,
    });
  }

  async claimPending(id: string, now: Date): Promise<Notification | null> {
    const result = await this.db.notification.updateMany({
      where: {
        id,
        OR: [
          { status: 'PENDING', scheduledFor: { lte: now } },
          { status: 'FAILED', nextAttemptAt: { lte: now } },
        ],
      },
      data: {
        status: 'PROCESSING',
        processingStartedAt: now,
        attemptCount: { increment: 1 },
      },
    });

    return result.count === 1
      ? this.db.notification.findUnique({ where: { id } })
      : null;
  }

  markSent(id: string, input: SentNotification): Promise<Notification> {
    return this.db.notification.update({
      where: { id },
      data: {
        status: 'SENT',
        providerMessageId: input.providerMessageId,
        sentAt: input.sentAt,
        nextAttemptAt: null,
        processingStartedAt: null,
        lastError: null,
      },
    });
  }

  markFailed(id: string, input: FailedNotification): Promise<Notification> {
    return this.db.notification.update({
      where: { id },
      data: {
        status: 'FAILED',
        lastError: input.lastError,
        nextAttemptAt: input.nextAttemptAt,
        processingStartedAt: null,
      },
    });
  }

  async reclaimExpiredProcessing(now: Date): Promise<number> {
    const leaseExpiredBefore = new Date(now.getTime() - 15 * 60 * 1000);
    const result = await this.db.notification.updateMany({
      where: {
        status: 'PROCESSING',
        processingStartedAt: { lt: leaseExpiredBefore },
      },
      data: {
        status: 'PENDING',
        processingStartedAt: null,
        attemptCount: { increment: 1 },
      },
    });
    return result.count;
  }
}
