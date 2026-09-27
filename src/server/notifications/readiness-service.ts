import type { PrismaClient } from '@/generated/prisma/client';
import { serverEnv } from '@/lib/env';
import { notificationProcessorFailureCode } from './configuration-failure';
import { evaluateNotificationReadiness, type NotificationReadinessResult } from './readiness';

const OVERDUE_PENDING_GRACE_MILLISECONDS = 10 * 60_000;
const CRON_JOB_NAME = 'remindly-process-due-notifications';

async function cronJobActive(db: PrismaClient): Promise<boolean> {
  try {
    const rows = await db.$queryRaw<Array<{ active: boolean }>>`
      SELECT active
      FROM cron.job
      WHERE jobname = ${CRON_JOB_NAME}
      LIMIT 1
    `;
    return rows[0]?.active === true;
  } catch {
    return false;
  }
}

export async function readNotificationReadiness(
  db: PrismaClient,
  now: Date,
): Promise<NotificationReadinessResult> {
  let configurationFailureCode: string | null = null;
  try {
    serverEnv();
  } catch (error) {
    configurationFailureCode = notificationProcessorFailureCode(error);
  }

  const overdueBefore = new Date(now.getTime() - OVERDUE_PENDING_GRACE_MILLISECONDS);
  const [cronActive, latestProcessorRun, overduePendingCount] = await Promise.all([
    cronJobActive(db),
    db.processorRun.findFirst({ orderBy: { startedAt: 'desc' } }),
    db.notification.count({
      where: {
        status: 'PENDING',
        scheduledFor: { lte: overdueBefore },
      },
    }),
  ]);

  return evaluateNotificationReadiness({
    now,
    configurationFailureCode,
    cronJobActive: cronActive,
    latestProcessorRun: latestProcessorRun
      ? {
          status: latestProcessorRun.status,
          startedAt: latestProcessorRun.startedAt,
          failureCode: latestProcessorRun.sanitizedFailureCode,
        }
      : null,
    overduePendingCount,
  });
}
