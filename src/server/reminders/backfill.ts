import { fromZonedTime } from 'date-fns-tz';

const MINUTE = 60_000;

export type BackfillStatus = 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'CANCELLED';

export interface LegacyBackfillReminder {
  id: string;
  userId: string | null;
  endDate: Date;
  alertTime: string;
  alertAt: Date;
  status: 'ACTIVE' | 'DONE' | 'ARCHIVED';
}

export interface BackfillNotification {
  id: string;
  reminderId: string;
  scheduledFor: Date;
  status: BackfillStatus;
  channel: 'EMAIL';
}

export interface BackfillAlert {
  id: string;
  reminderId: string;
  scheduledFor: Date;
  scheduleVersion: number;
  channel: 'EMAIL';
}

export type BackfillAction =
  | { kind: 'updateReminder'; reminderId: string; dueAt: Date }
  | { kind: 'createAlert'; alertId: string; reminderId: string; scheduledFor: Date; offsetMinutes: number; scheduleVersion: 1 }
  | { kind: 'linkNotification'; notificationId: string; alertId: string; scheduleVersion: 1 }
  | { kind: 'createNotification'; notificationId: string; reminderId: string; alertId: string; scheduledFor: Date; scheduleVersion: 1 };

export interface BackfillPlan {
  actions: BackfillAction[];
  issues: Array<{ code: 'MISSING_OWNER' | 'INVALID_SCHEDULE' | 'AMBIGUOUS_NOTIFICATION'; reminderId: string }>;
  counts: {
    reminders: number;
    remindersWithOwners: number;
    alertsCreated: number;
    notificationsLinked: number;
    notificationsCreated: number;
  };
}

export interface BackfillWriter {
  updateReminder(input: { reminderId: string; dueAt: Date }): Promise<void>;
  createAlert(input: { alertId: string; reminderId: string; scheduledFor: Date; offsetMinutes: number; scheduleVersion: 1 }): Promise<void>;
  createNotification(input: { notificationId: string; reminderId: string; alertId: string; scheduledFor: Date; scheduleVersion: 1 }): Promise<void>;
  linkNotification(input: { notificationId: string; alertId: string; scheduleVersion: 1 }): Promise<void>;
}

export interface BackfillInput {
  reminders: LegacyBackfillReminder[];
  profiles: Map<string, { timezone: string }>;
  notifications: BackfillNotification[];
  alerts: BackfillAlert[];
  defaultTimezone: string;
  idFactory?: () => string;
}

function datePart(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function dueAtFor(reminder: LegacyBackfillReminder, timezone: string): Date {
  return fromZonedTime(`${datePart(reminder.endDate)}T${reminder.alertTime}:00`, timezone);
}

export function buildLegacyBackfillPlan(input: BackfillInput): BackfillPlan {
  const idFactory = input.idFactory ?? (() => crypto.randomUUID());
  const actions: BackfillAction[] = [];
  const issues: BackfillPlan['issues'] = [];
  const counts = {
    reminders: input.reminders.length,
    remindersWithOwners: 0,
    alertsCreated: 0,
    notificationsLinked: 0,
    notificationsCreated: 0,
  };

  for (const reminder of input.reminders) {
    if (!reminder.userId) {
      if (reminder.status === 'ACTIVE') issues.push({ code: 'MISSING_OWNER', reminderId: reminder.id });
      continue;
    }
    counts.remindersWithOwners += 1;
    const timezone = input.profiles.get(reminder.userId)?.timezone ?? input.defaultTimezone;
    const dueAt = dueAtFor(reminder, timezone);
    const offsetMinutes = Math.round((dueAt.getTime() - reminder.alertAt.getTime()) / MINUTE);
    if (!Number.isInteger(offsetMinutes) || offsetMinutes <= 0) {
      issues.push({ code: 'INVALID_SCHEDULE', reminderId: reminder.id });
      continue;
    }

    actions.push({ kind: 'updateReminder', reminderId: reminder.id, dueAt });
    const currentAlert = input.alerts.find(
      (alert) => alert.reminderId === reminder.id && alert.channel === 'EMAIL' && alert.scheduledFor.getTime() === reminder.alertAt.getTime(),
    );
    const alertId = currentAlert?.id ?? idFactory();
    if (!currentAlert) {
      counts.alertsCreated += 1;
      actions.push({ kind: 'createAlert', alertId, reminderId: reminder.id, scheduledFor: reminder.alertAt, offsetMinutes, scheduleVersion: 1 });
    }

    const currentNotifications = input.notifications.filter(
      (notification) => notification.reminderId === reminder.id
        && notification.channel === 'EMAIL'
        && notification.scheduledFor.getTime() === reminder.alertAt.getTime(),
    );
    if (currentNotifications.length > 1) {
      issues.push({ code: 'AMBIGUOUS_NOTIFICATION', reminderId: reminder.id });
      continue;
    }
    const notification = currentNotifications[0];
    if (notification) {
      counts.notificationsLinked += 1;
      actions.push({ kind: 'linkNotification', notificationId: notification.id, alertId, scheduleVersion: 1 });
    } else {
      const notificationId = idFactory();
      counts.notificationsCreated += 1;
      actions.push({ kind: 'createNotification', notificationId, reminderId: reminder.id, alertId, scheduledFor: reminder.alertAt, scheduleVersion: 1 });
    }
  }

  return { actions, issues, counts };
}

export async function executeBackfillPlan(
  plan: BackfillPlan,
  writer: BackfillWriter,
  options: { dryRun: boolean },
): Promise<void> {
  if (options.dryRun) return;
  for (const action of plan.actions) {
    if (action.kind === 'updateReminder') await writer.updateReminder(action);
    if (action.kind === 'createAlert') await writer.createAlert(action);
    if (action.kind === 'linkNotification') await writer.linkNotification(action);
    if (action.kind === 'createNotification') await writer.createNotification(action);
  }
}
