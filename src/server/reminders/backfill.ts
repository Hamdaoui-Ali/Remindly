import { fromZonedTime } from 'date-fns-tz';

export type BackfillReminderStatus = 'ACTIVE' | 'DONE' | 'ARCHIVED';
export type BackfillNotificationStatus = 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'CANCELLED';

export interface LegacyBackfillReminder {
  id: string;
  endDate: Date;
  alertAt: Date;
  alertLeadDays: number;
  userId: string | null;
  status: BackfillReminderStatus;
}

export interface LegacyBackfillNotification {
  id: string;
  reminderId: string;
  scheduledFor: Date;
  status: BackfillNotificationStatus;
  reminderAlertId: string | null;
  scheduleVersion: number | null;
}

export type BackfillIssue =
  | 'missing_owner'
  | 'missing_notification'
  | 'mismatched_notification'
  | 'invalid_reminder';

export interface LegacyBackfillPlan {
  dueAt: Date | null;
  alert: {
    id: string;
    reminderId: string;
    scheduledFor: Date;
    offsetMinutes: number;
    scheduleVersion: 1;
  } | null;
  notificationCreate: {
    id: string;
    reminderId: string;
    reminderAlertId: string;
    scheduledFor: Date;
    scheduleVersion: 1;
    channel: 'EMAIL';
    status: 'PENDING';
    idempotencyKey: string;
  } | null;
  notificationUpdates: Array<{
    id: string;
    reminderAlertId: string;
    scheduleVersion: 1;
  }>;
  issues: BackfillIssue[];
}

export interface BackfillReport {
  remindersScanned: number;
  remindersConverted: number;
  alertsCreated: number;
  notificationsLinked: number;
  notificationsCreated: number;
  alreadyMigrated: number;
  missingOwners: number;
  missingNotifications: number;
  mismatchedNotifications: number;
  invalidReminders: number;
}

export interface BackfillVerification {
  ready: boolean;
  failures: string[];
}

function validDate(value: Date): boolean {
  return !Number.isNaN(value.getTime());
}

function dueAtForLegacyDate(endDate: Date, timezone: string): Date {
  const date = endDate.toISOString().slice(0, 10);
  const dueAt = fromZonedTime(`${date}T23:59:00`, timezone);
  if (!validDate(dueAt)) throw new Error('Invalid reminder deadline');
  return dueAt;
}

export function buildLegacyBackfillPlan(input: {
  reminder: LegacyBackfillReminder;
  timezone: string;
  notifications: LegacyBackfillNotification[];
  alertId: string;
}): LegacyBackfillPlan {
  const { reminder } = input;
  const issues: BackfillIssue[] = [];

  if (!reminder.userId) issues.push('missing_owner');
  if (!validDate(reminder.endDate) || !validDate(reminder.alertAt)) {
    issues.push('invalid_reminder');
  }

  if (issues.length > 0) {
    return { dueAt: null, alert: null, notificationCreate: null, notificationUpdates: [], issues };
  }

  let dueAt: Date;
  try {
    dueAt = dueAtForLegacyDate(reminder.endDate, input.timezone);
  } catch {
    return { dueAt: null, alert: null, notificationCreate: null, notificationUpdates: [], issues: ['invalid_reminder'] };
  }

  const offsetMinutes = Math.round((dueAt.getTime() - reminder.alertAt.getTime()) / 60_000);
  if (offsetMinutes <= 0) {
    return { dueAt: null, alert: null, notificationCreate: null, notificationUpdates: [], issues: ['invalid_reminder'] };
  }

  const matching = input.notifications.filter((notification) => (
    notification.reminderId === reminder.id
    && notification.scheduledFor.getTime() === reminder.alertAt.getTime()
  ));

  if (matching.length === 0) {
    return {
      dueAt,
      alert: {
        id: input.alertId,
        reminderId: reminder.id,
        scheduledFor: reminder.alertAt,
        offsetMinutes,
        scheduleVersion: 1,
      },
      notificationCreate: {
        id: crypto.randomUUID(),
        reminderId: reminder.id,
        reminderAlertId: input.alertId,
        scheduledFor: reminder.alertAt,
        scheduleVersion: 1,
        channel: 'EMAIL',
        status: 'PENDING',
        idempotencyKey: crypto.randomUUID(),
      },
      notificationUpdates: [],
      issues,
    };
  }
  if (matching.length > 1) {
    return { dueAt, alert: null, notificationCreate: null, notificationUpdates: [], issues: ['mismatched_notification'] };
  }

  return {
    dueAt,
    alert: {
      id: input.alertId,
      reminderId: reminder.id,
      scheduledFor: reminder.alertAt,
      offsetMinutes,
      scheduleVersion: 1,
    },
    notificationCreate: null,
    notificationUpdates: [{
      id: matching[0].id,
      reminderAlertId: input.alertId,
      scheduleVersion: 1,
    }],
    issues,
  };
}

export function evaluateBackfillReport(report: BackfillReport): BackfillVerification {
  const failures: string[] = [];
  if (report.remindersScanned !== report.remindersConverted + report.alreadyMigrated) {
    failures.push('reminder counts do not reconcile');
  }
  if (report.missingOwners > 0) failures.push('active reminders are missing owners');
  if (report.missingNotifications > 0) failures.push('alerts are missing current notifications');
  if (report.mismatchedNotifications > 0) failures.push('linked notifications have mismatched schedules');
  if (report.invalidReminders > 0) failures.push('legacy reminders contain invalid dates or schedules');

  if (failures.length > 0) {
    throw new Error(`Backfill verification failed: ${failures.join('; ')}`);
  }
  return { ready: true, failures };
}
