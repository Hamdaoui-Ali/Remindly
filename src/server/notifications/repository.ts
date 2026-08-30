import type {
  Notification,
  NotificationChannel,
  NotificationStatus,
  Prisma,
  PrismaClient,
} from '@/generated/prisma/client';

export type NotificationDatabase = PrismaClient | Prisma.TransactionClient;

export interface CreatePendingNotification {
  id: string;
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

export interface ClaimedNotificationTransition extends NotificationTransition {
  expectedProcessingStartedAt: Date;
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
  minimumAttemptCount?: number;
  nextAttemptAt?: Date | null;
  lastError?: string | null;
}

export interface AtomicDueClaim {
  now: Date;
  leaseExpiredBefore: Date;
  limit: number;
  maximumAttempts: number;
  pendingStatus: NotificationStatus;
  failedStatus: NotificationStatus;
  processingStatus: NotificationStatus;
  claimedStatus: NotificationStatus;
}

export interface MissingNotificationReconciliation {
  now: Date;
  reminderStatus: 'ACTIVE';
  channel: NotificationChannel;
  notificationStatus: NotificationStatus;
}

export interface ClaimedNotification extends Notification {
  recovered: boolean;
}

export type NotificationWithReminder = Prisma.NotificationGetPayload<{
  include: {
    reminder: true;
    alert: {
      include: {
        reminder: { include: { userProfile: true } };
      };
    };
  };
}>;

/**
 * Persistence primitives only. Task 5 selects eligible statuses, retry timing,
 * the 15-minute lease cutoff, and all lifecycle transition values.
 */
export class NotificationRepository {
  constructor(private readonly db: NotificationDatabase) {}

  createPending(input: CreatePendingNotification): Promise<Notification> {
    return this.db.notification.create({ data: input });
  }

  findForReminderSchedule(reminderId: string, scheduledFor: Date): Promise<Notification | null> {
    return this.db.notification.findUnique({
      where: {
        reminderId_scheduledFor_channel: {
          reminderId,
          scheduledFor,
          channel: 'EMAIL',
        },
      },
    });
  }

  findCurrentForReminders(reminders: Array<{ id: string; alertAt: Date }>): Promise<Notification[]> {
    if (reminders.length === 0) return Promise.resolve([]);
    return this.db.notification.findMany({
      where: {
        OR: reminders.map((reminder) => ({
          reminderId: reminder.id,
          scheduledFor: reminder.alertAt,
          channel: 'EMAIL' as const,
        })),
      },
    });
  }

  async reactivateCancelled(id: string): Promise<Notification | null> {
    const updated = await this.db.notification.updateMany({
      where: { id, status: 'CANCELLED' },
      data: {
        status: 'PENDING',
        attemptCount: 0,
        nextAttemptAt: null,
        processingStartedAt: null,
        providerMessageId: null,
        lastError: null,
        sentAt: null,
      },
    });
    return updated.count === 1 ? this.db.notification.findUnique({ where: { id } }) : null;
  }

  findPendingForReminderIds(reminderIds: string[]): Promise<Notification[]> {
    if (reminderIds.length === 0) return Promise.resolve([]);
    return this.db.notification.findMany({
      where: { reminderId: { in: reminderIds }, status: 'PENDING' },
      orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }],
    });
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

  claimDue(input: AtomicDueClaim): Promise<ClaimedNotification[]> {
    return this.db.$queryRaw<ClaimedNotification[]>`
      WITH candidates AS (
        SELECT id, status AS original_status
        FROM notifications
        WHERE attempt_count < ${input.maximumAttempts}
          AND (
            reminder_alert_id IS NULL
            OR EXISTS (
              SELECT 1
              FROM reminder_alerts AS alert
              JOIN reminders AS reminder ON reminder.id = alert.reminder_id
              JOIN user_profiles AS profile ON profile.id = reminder.user_id
              WHERE alert.id = notifications.reminder_alert_id
                AND reminder.status = 'ACTIVE'::"ReminderStatus"
                AND alert.enabled = TRUE
                AND notifications.schedule_version = alert.schedule_version
                AND notifications.scheduled_for = alert.scheduled_for
                AND profile.email IS NOT NULL
                AND profile.email_verified_at IS NOT NULL
            )
          )
          AND (
            (status = ${input.pendingStatus}::"NotificationStatus" AND scheduled_for <= ${input.now})
            OR (status = ${input.failedStatus}::"NotificationStatus" AND next_attempt_at <= ${input.now})
            OR (
              status = ${input.processingStatus}::"NotificationStatus"
              AND processing_started_at < ${input.leaseExpiredBefore}
            )
          )
        ORDER BY scheduled_for ASC, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${input.limit}
      )
      UPDATE notifications AS notification
      SET status = ${input.claimedStatus}::"NotificationStatus",
          attempt_count = notification.attempt_count + 1,
          processing_started_at = ${input.now},
          next_attempt_at = NULL,
          updated_at = ${input.now}
      FROM candidates
      WHERE notification.id = candidates.id
      RETURNING
        notification.id,
        notification.reminder_id AS "reminderId",
        notification.scheduled_for AS "scheduledFor",
        notification.channel::text AS channel,
        notification.status::text AS status,
        notification.attempt_count AS "attemptCount",
        notification.next_attempt_at AS "nextAttemptAt",
        notification.processing_started_at AS "processingStartedAt",
        notification.idempotency_key AS "idempotencyKey",
        notification.provider_message_id AS "providerMessageId",
        notification.last_error AS "lastError",
        notification.sent_at AS "sentAt",
        notification.created_at AS "createdAt",
        notification.updated_at AS "updatedAt",
        (candidates.original_status = ${input.processingStatus}::"NotificationStatus") AS recovered
    `;
  }

  findClaimedWithReminder(id: string): Promise<NotificationWithReminder | null> {
    return this.db.notification.findUnique({
      where: { id },
      include: {
        reminder: true,
        alert: {
          include: {
            reminder: { include: { userProfile: true } },
          },
        },
      },
    });
  }

  async transitionWhenStatus(
    id: string,
    expectedStatus: NotificationStatus,
    transition: ClaimedNotificationTransition,
  ): Promise<boolean> {
    const { expectedProcessingStartedAt, ...data } = transition;
    const result = await this.db.notification.updateMany({
      where: { id, status: expectedStatus, processingStartedAt: expectedProcessingStartedAt },
      data,
    });
    return result.count === 1;
  }

  async reconcileMissingPending(input: MissingNotificationReconciliation): Promise<number> {
    const created = await this.db.$queryRaw<Array<{ id: string }>>`
      WITH locked_reminders AS MATERIALIZED (
        SELECT reminder.id, reminder.alert_at
        FROM reminders AS reminder
        WHERE reminder.status = ${input.reminderStatus}::"ReminderStatus"
        FOR UPDATE OF reminder SKIP LOCKED
      ),
      missing AS MATERIALIZED (
        SELECT gen_random_uuid() AS id, reminder.id AS reminder_id, reminder.alert_at
        FROM locked_reminders AS reminder
        WHERE NOT EXISTS (
            SELECT 1
            FROM notifications AS notification
            WHERE notification.reminder_id = reminder.id
              AND notification.scheduled_for = reminder.alert_at
              AND notification.channel = ${input.channel}::"NotificationChannel"
          )
      )
      INSERT INTO notifications (
        id,
        reminder_id,
        scheduled_for,
        channel,
        status,
        idempotency_key,
        created_at,
        updated_at
      )
      SELECT
        missing.id,
        missing.reminder_id,
        missing.alert_at,
        ${input.channel}::"NotificationChannel",
        ${input.notificationStatus}::"NotificationStatus",
        missing.id::text,
        ${input.now},
        ${input.now}
      FROM missing
      ON CONFLICT DO NOTHING
      RETURNING id
    `;
    return created.length;
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

  markSent(id: string, transition: ClaimedNotificationTransition): Promise<boolean> {
    return this.transitionWhenStatus(id, 'PROCESSING', transition);
  }

  markFailed(id: string, transition: ClaimedNotificationTransition): Promise<boolean> {
    return this.transitionWhenStatus(id, 'PROCESSING', transition);
  }

  async reclaimExpiredProcessing(input: ReclaimExpiredProcessing): Promise<number> {
    const data: Prisma.NotificationUpdateManyMutationInput = {
      status: input.status,
      processingStartedAt: input.processingStartedAt,
      nextAttemptAt: input.nextAttemptAt,
      lastError: input.lastError,
    };
    if (input.incrementAttemptCount) {
      data.attemptCount = { increment: 1 };
    }

    const result = await this.db.notification.updateMany({
      where: {
        status: input.expectedStatus,
        processingStartedAt: { lt: input.leaseExpiredBefore },
        ...(input.minimumAttemptCount === undefined
          ? {}
          : { attemptCount: { gte: input.minimumAttemptCount } }),
      },
      data,
    });
    return result.count;
  }
}
