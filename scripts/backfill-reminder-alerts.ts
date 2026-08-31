import nextEnv from '@next/env';
import { buildLegacyBackfillPlan, evaluateBackfillReport, type BackfillReport } from '../src/server/reminders/backfill';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);

const PAGE_SIZE = 250;

function emptyReport(): BackfillReport {
  return {
    remindersScanned: 0,
    remindersConverted: 0,
    alertsCreated: 0,
    notificationsLinked: 0,
    alreadyMigrated: 0,
    missingOwners: 0,
    missingNotifications: 0,
    mismatchedNotifications: 0,
    invalidReminders: 0,
  };
}

function addIssues(report: BackfillReport, issues: string[]): void {
  if (issues.includes('missing_owner')) report.missingOwners += 1;
  if (issues.includes('missing_notification')) report.missingNotifications += 1;
  if (issues.includes('mismatched_notification')) report.mismatchedNotifications += 1;
  if (issues.includes('invalid_reminder')) report.invalidReminders += 1;
}

async function main() {
  const [{ prisma }, { SettingsRepository }] = await Promise.all([
    import('../src/server/db/client'),
    import('../src/server/settings/repository'),
  ]);
  const dryRun = !process.argv.includes('--apply');
  const report = emptyReport();
  const settings = await new SettingsRepository(prisma).getSingleton();
  let cursor: string | undefined;

  for (;;) {
    const reminders = await prisma.reminder.findMany({
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      take: PAGE_SIZE,
      orderBy: { id: 'asc' },
      include: {
        userProfile: { select: { timezone: true } },
        alerts: { where: { enabled: true }, include: { notifications: true } },
        notifications: true,
      },
    });
    if (reminders.length === 0) break;

    for (const reminder of reminders) {
      report.remindersScanned += 1;
      const currentAlert = reminder.alerts.find((alert) => alert.enabled);
      if (currentAlert) {
        const currentNotification = currentAlert.notifications.find((notification) => (
          notification.scheduleVersion === currentAlert.scheduleVersion
          && notification.scheduledFor.getTime() === currentAlert.scheduledFor.getTime()
        ));
        if (!currentNotification) report.missingNotifications += 1;
        if (reminder.status === 'ACTIVE' && !reminder.userId) report.missingOwners += 1;
        report.alreadyMigrated += 1;
        continue;
      }

      const plan = buildLegacyBackfillPlan({
        reminder: {
          id: reminder.id,
          endDate: reminder.endDate,
          alertAt: reminder.alertAt,
          alertLeadDays: reminder.alertLeadDays,
          userId: reminder.userId,
          status: reminder.status,
        },
        timezone: reminder.userProfile?.timezone ?? settings?.timezone ?? 'UTC',
        notifications: reminder.notifications.map((notification) => ({
          id: notification.id,
          reminderId: notification.reminderId,
          scheduledFor: notification.scheduledFor,
          status: notification.status,
          reminderAlertId: notification.reminderAlertId,
          scheduleVersion: notification.scheduleVersion,
        })),
        alertId: crypto.randomUUID(),
      });

      addIssues(report, plan.issues);
      if (!plan.alert || !plan.dueAt) continue;
      report.remindersConverted += 1;
      report.alertsCreated += 1;
      report.notificationsLinked += plan.notificationUpdates.length;

      if (dryRun) continue;
      await prisma.$transaction(async (tx) => {
        await tx.reminder.update({ where: { id: reminder.id }, data: { dueAt: plan.dueAt } });
        await tx.reminderAlert.create({
          data: {
            id: plan.alert!.id,
            reminderId: plan.alert!.reminderId,
            scheduledFor: plan.alert!.scheduledFor,
            offsetMinutes: plan.alert!.offsetMinutes,
            scheduleVersion: plan.alert!.scheduleVersion,
            channel: 'EMAIL',
            enabled: true,
          },
        });
        for (const update of plan.notificationUpdates) {
          await tx.notification.update({
            where: { id: update.id },
            data: {
              reminderAlertId: update.reminderAlertId,
              scheduleVersion: update.scheduleVersion,
            },
          });
        }
      });
    }

    cursor = reminders[reminders.length - 1].id;
    if (reminders.length < PAGE_SIZE) break;
  }

  const verification = evaluateBackfillReport(report);
  console.info(JSON.stringify({ ...report, dryRun, ready: verification.ready }));
  await prisma.$disconnect();
}

try {
  await main();
} catch {
  console.error('Reminder alert backfill failed');
  process.exitCode = 1;
}
