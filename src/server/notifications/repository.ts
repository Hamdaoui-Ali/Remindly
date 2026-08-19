import type {
  Notification,
  NotificationChannel,
  NotificationStatus,
  Prisma,
  PrismaClient,
} from '@/generated/prisma/client';

export type NotificationDatabase = PrismaClient | Prisma.TransactionClient;

export interface CreatePendingNotification {
  reminderId: string;
  scheduledFor: Date;
  idempotencyKey: string;
  channel: NotificationChannel;
  status: NotificationStatus;
}

export interface DueNotificationCandidatesQuery {
  now: Date;
  scheduledForStatuses: NotificationStatus[];
  nextAttemptStatuses: NotificationStatus[];
  limit: number;
}

export interface NotificationTransition {
  status: NotificationStatus;
  providerMessageId?: string | null;
  sentAt?: Date | null;
  nextAttemptAt?: Date | null;
  processingStartedAt?: Date | null;
  lastError?: string | null;
}

export interface ClaimPendingNotification extends NotificationTransition {
  id: string;
  expectedStatuses: NotificationStatus[];
  processingStartedAt: Date | null;
  incrementAttemptCount: boolean;
}

export interface NotificationStatusTransition {
  expectedStatus: NotificationStatus;
  status: NotificationStatus;
}

export interface ReclaimExpiredProcessing extends NotificationStatusTransition {
  leaseExpiredBefore: Date;
  processingStartedAt: Date | null;
  incrementAttemptCount: boolean;
}

/**
 * Persistence primitives only. Task 5 selects eligible statuses, retry timing,
 * the 15-minute lease cutoff, and all lifecycle transition values.
 */
export class NotificationRepository {
  constructor(private readonly db: NotificationDatabase) {}

  createPending(input: CreatePendingNotification): Promise<Notification> {
    return this.db.notification.create({ data: input });
  }

  async cancelPendingForReminder(
    reminderId: string,
    transition: NotificationStatusTransition,
  ): Promise<number> {
    const result = await this.db.notification.updateMany({
      where: { reminderId, status: transition.expectedStatus },
      data: { status: transition.status },
    });
    return result.count;
  }

  findDueCandidates(query: DueNotificationCandidatesQuery): Promise<Notification[]> {
    return this.db.notification.findMany({
      where: {
        OR: [
          {
            status: { in: query.scheduledForStatuses },
            scheduledFor: { lte: query.now },
          },
          {
            status: { in: query.nextAttemptStatuses },
            nextAttemptAt: { lte: query.now },
          },
        ],
      },
      orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }],
      take: query.limit,
    });
  }

  async claimPending(input: ClaimPendingNotification): Promise<Notification | null> {
    const data: Prisma.NotificationUpdateManyMutationInput = {
      status: input.status,
      processingStartedAt: input.processingStartedAt,
      providerMessageId: input.providerMessageId,
      sentAt: input.sentAt,
      nextAttemptAt: input.nextAttemptAt,
      lastError: input.lastError,
    };
    if (input.incrementAttemptCount) {
      data.attemptCount = { increment: 1 };
    }

    const result = await this.db.notification.updateMany({
      where: {
        id: input.id,
        status: { in: input.expectedStatuses },
      },
      data,
    });

    return result.count === 1
      ? this.db.notification.findUnique({ where: { id: input.id } })
      : null;
  }

  markSent(id: string, transition: NotificationTransition): Promise<Notification> {
    return this.db.notification.update({
      where: { id },
      data: transition,
    });
  }

  markFailed(id: string, transition: NotificationTransition): Promise<Notification> {
    return this.db.notification.update({
      where: { id },
      data: transition,
    });
  }

  async reclaimExpiredProcessing(input: ReclaimExpiredProcessing): Promise<number> {
    const data: Prisma.NotificationUpdateManyMutationInput = {
      status: input.status,
      processingStartedAt: input.processingStartedAt,
    };
    if (input.incrementAttemptCount) {
      data.attemptCount = { increment: 1 };
    }

    const result = await this.db.notification.updateMany({
      where: {
        status: input.expectedStatus,
        processingStartedAt: { lt: input.leaseExpiredBefore },
      },
      data,
    });
    return result.count;
  }
}
