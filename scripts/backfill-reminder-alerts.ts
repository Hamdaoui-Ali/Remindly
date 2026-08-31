import { prisma } from '@/server/db/client';
import {
  buildLegacyBackfillPlan,
  executeBackfillPlan,
  type BackfillWriter,
} from '@/server/reminders/backfill';

const dryRun = !process.argv.includes('--apply');

async function main(): Promise<void> {
  const [reminders, profiles, settings] = await Promise.all([
    prisma.reminder.findMany({ include: { alerts: true, notifications: true } }),
    prisma.userProfile.findMany({ select: { id: true, timezone: true } }),
    prisma.settings.findUnique({ where: { id: 'singleton' }, select: { timezone: true } }),
  ]);

  const plan = buildLegacyBackfillPlan({
    reminders: reminders.map((reminder) => ({
      id: reminder.id,
      userId: reminder.userId,
      endDate: reminder.endDate,
      alertTime: reminder.alertTime,
      alertAt: reminder.alertAt,
      status: reminder.status,
    })),
    profiles: new Map(profiles.map((profile) => [profile.id, { timezone: profile.timezone }])),
    alerts: reminders.flatMap((reminder) => reminder.alerts.map((alert) => ({
      id: alert.id,
      reminderId: alert.reminderId,
      scheduledFor: alert.scheduledFor,
      scheduleVersion: alert.scheduleVersion,
      channel: alert.channel,
    }))),
    notifications: reminders.flatMap((reminder) => reminder.notifications.map((notification) => ({
      id: notification.id,
      reminderId: notification.reminderId,
      scheduledFor: notification.scheduledFor,
      status: notification.status,
      channel: notification.channel,
    }))),
    defaultTimezone: settings?.timezone ?? 'UTC',
  });

  console.log(JSON.stringify({ mode: dryRun ? 'dry-run' : 'apply', counts: plan.counts, issues: plan.issues }));
  if (plan.issues.length > 0) {
    throw new Error('Backfill verification failed');
  }
  if (dryRun) return;

  await prisma.$transaction(async (tx) => {
    const writer: BackfillWriter = {
      updateReminder: async ({ reminderId, dueAt }) => {
        await tx.reminder.update({ where: { id: reminderId }, data: { dueAt } });
      },
      createAlert: async ({ alertId, reminderId, scheduledFor, offsetMinutes, scheduleVersion }) => {
        await tx.reminderAlert.create({
          data: { id: alertId, reminderId, scheduledFor, offsetMinutes, scheduleVersion, channel: 'EMAIL', enabled: true },
        });
      },
      linkNotification: async ({ notificationId, alertId, scheduleVersion }) => {
        await tx.notification.update({ where: { id: notificationId }, data: { reminderAlertId: alertId, scheduleVersion } });
      },
      createNotification: async ({ notificationId, reminderId, alertId, scheduledFor, scheduleVersion }) => {
        await tx.notification.create({
          data: {
            id: notificationId,
            reminderId,
            reminderAlertId: alertId,
            scheduledFor,
            scheduleVersion,
            channel: 'EMAIL',
            status: 'PENDING',
            idempotencyKey: notificationId,
          },
        });
      },
    };
    await executeBackfillPlan(plan, writer, { dryRun: false });
  });
}

main()
  .catch(() => process.exitCode = 1)
  .finally(() => prisma.$disconnect());
