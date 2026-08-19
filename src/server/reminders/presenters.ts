import type { Notification, Reminder } from '@/generated/prisma/client';
import type { ReminderCycle, ReminderListItem, ReminderMutationResult, ReminderWithNotifications } from './types';
import type { Urgency } from '@/server/urgency/types';
import { calendarDayDifference } from '@/server/urgency/calendar';
import { calculateUrgency } from '@/server/urgency/urgency';

const URGENCY_RANK: Record<Urgency, number> = {
  OVERDUE: 0,
  URGENT: 1,
  SOON: 2,
  SAFE: 3,
};

export interface ReminderPresentation {
  id: string;
  name: string;
  endDate: string;
  alertLeadDays: number;
  alertTime: string;
  status: Reminder['status'];
  parentReminderId: string | null;
}

export interface ScheduledEmailPresentation {
  id: string;
  scheduledFor: string;
  status: Notification['status'];
  channel: Notification['channel'];
  label: string;
}

export interface ReminderListPresentation extends ReminderPresentation {
  urgency: Urgency;
  urgencyLabel: string;
  remainingCalendarDays: number;
  relativeTime: string;
  scheduledEmail: ScheduledEmailPresentation | null;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function relativeTime(days: number): string {
  if (days < -1) return `${Math.abs(days)} days overdue`;
  if (days === -1) return '1 day overdue';
  if (days === 0) return 'Due today';
  if (days === 1) return '1 day left';
  return `${days} days left`;
}

function notificationLabel(scheduledFor: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  });
  return `Scheduled email ${formatter.format(scheduledFor)}`;
}

export function presentReminder(reminder: Reminder): ReminderPresentation {
  return {
    id: reminder.id,
    name: reminder.name,
    endDate: dateOnly(reminder.endDate),
    alertLeadDays: reminder.alertLeadDays,
    alertTime: reminder.alertTime,
    status: reminder.status,
    parentReminderId: reminder.parentReminderId,
  };
}

export function presentReminderListItem(item: ReminderListItem, timezone: string): ReminderListPresentation {
  return {
    ...presentReminder(item.reminder),
    urgency: item.urgency,
    urgencyLabel: item.urgency.charAt(0) + item.urgency.slice(1).toLowerCase(),
    remainingCalendarDays: item.remainingCalendarDays,
    relativeTime: relativeTime(item.remainingCalendarDays),
    scheduledEmail: item.scheduledEmail
      ? {
          id: item.scheduledEmail.id,
          scheduledFor: item.scheduledEmail.scheduledFor.toISOString(),
          status: item.scheduledEmail.status,
          channel: item.scheduledEmail.channel,
          label: notificationLabel(item.scheduledEmail.scheduledFor, timezone),
        }
      : null,
  };
}

export function presentReminderList(items: ReminderListItem[], timezone: string): ReminderListPresentation[] {
  return items
    .map((item) => presentReminderListItem(item, timezone))
    .sort((left, right) => URGENCY_RANK[left.urgency] - URGENCY_RANK[right.urgency]
      || left.endDate.localeCompare(right.endDate));
}

function presentNotification(notification: Notification) {
  return {
    id: notification.id,
    scheduledFor: notification.scheduledFor.toISOString(),
    channel: notification.channel,
    status: notification.status,
    attemptCount: notification.attemptCount,
    providerMessageId: notification.providerMessageId,
    lastError: notification.lastError,
    sentAt: notification.sentAt?.toISOString() ?? null,
  };
}

export function presentReminderHistory(reminder: ReminderWithNotifications) {
  return {
    ...presentReminder(reminder),
    notifications: reminder.notifications.map(presentNotification),
  };
}

function mutationListItem(result: ReminderMutationResult, now: Date, timezone: string): ReminderListItem {
  const endDate = dateOnly(result.reminder.endDate);
  return {
    reminder: result.reminder,
    urgency: calculateUrgency(endDate, now, timezone),
    remainingCalendarDays: calendarDayDifference(endDate, now, timezone),
    scheduledEmail: result.notification
      ? {
          id: result.notification.id,
          scheduledFor: result.notification.scheduledFor,
          status: result.notification.status,
          channel: result.notification.channel,
        }
      : null,
  };
}

export function presentReminderMutation(result: ReminderMutationResult, timezone: string, now: Date) {
  return presentReminderListItem(mutationListItem(result, now, timezone), timezone);
}

export function presentReminderCycle(cycle: ReminderCycle, timezone: string, now = new Date()) {
  return {
    reminder: presentReminderMutation(cycle, timezone, now),
    notification: {
      ...presentNotification(cycle.notification),
      label: notificationLabel(cycle.notification.scheduledFor, timezone),
    },
  };
}
