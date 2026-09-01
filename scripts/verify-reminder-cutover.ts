import nextEnv from '@next/env';

import {
  evaluateCutoverVerification,
  type CutoverVerificationInput,
} from '../src/server/reminders/cutover';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);

type CountRow = { count: bigint };

async function countAlertsMissingCurrentNotifications(prisma: {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}): Promise<number> {
  const rows = await prisma.$queryRaw<CountRow[]>`
    SELECT count(*)::bigint AS count
    FROM reminder_alerts AS alert
    JOIN reminders AS reminder ON reminder.id = alert.reminder_id
    WHERE reminder.status = 'ACTIVE'::"ReminderStatus"
      AND alert.enabled = TRUE
      AND NOT EXISTS (
        SELECT 1
        FROM notifications AS notification
        WHERE notification.reminder_alert_id = alert.id
          AND notification.schedule_version = alert.schedule_version
          AND notification.scheduled_for = alert.scheduled_for
          AND notification.channel = alert.channel
      )
  `;
  return Number(rows[0]?.count ?? 0n);
}

async function readVerificationInput(prisma: {
  reminder: { count(args: { where: object }): Promise<number> };
  notification: { count(args: { where: object }): Promise<number> };
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}): Promise<CutoverVerificationInput> {
  const [activeRemindersMissingOwners, remindersMissingDueAt, notificationsMissingAlerts,
    notificationsMissingScheduleVersions, alertsMissingCurrentNotifications] = await Promise.all([
    prisma.reminder.count({ where: { status: 'ACTIVE', userId: null } }),
    prisma.reminder.count({ where: { dueAt: null } }),
    prisma.notification.count({ where: { reminderAlertId: null } }),
    prisma.notification.count({ where: { scheduleVersion: null } }),
    countAlertsMissingCurrentNotifications(prisma),
  ]);

  const legacyRows = await prisma.notification.count({
    where: {
      reminderAlertId: null,
      status: { in: ['PENDING', 'FAILED', 'PROCESSING'] },
    },
  });

  return {
    activeRemindersMissingOwners,
    remindersMissingDueAt,
    notificationsMissingAlerts,
    notificationsMissingScheduleVersions,
    alertsMissingCurrentNotifications,
    legacyClaimableNotifications: legacyRows,
  };
}

async function main(): Promise<void> {
  const { prisma } = await import('../src/server/db/client');
  try {
    const input = await readVerificationInput(prisma);
    const result = evaluateCutoverVerification(input);
    console.info(JSON.stringify({ ...input, ...result }));
    if (!result.ready) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

try {
  await main();
} catch {
  console.error('Reminder cutover verification failed');
  process.exitCode = 1;
}
