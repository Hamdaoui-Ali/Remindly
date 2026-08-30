import type { Notification, Prisma, Reminder, ReminderAlert } from '@/generated/prisma/client';
import type { Urgency } from '@/server/urgency/types';

export interface LegacyCreateReminderInput {
  name: string;
  endDate: string;
  leadDays: number;
  alertTime: string;
  /** Accepted for API compatibility; schedules always use the singleton settings timezone. */
  timezone?: string;
}

export interface MultiAlertReminderInput {
  name: string;
  dueAt: string;
  alerts: ReminderAlertInput[];
}

export type ReminderAlertInput =
  | { kind: 'offset'; offsetMinutes: number }
  | { kind: 'absolute'; scheduledFor: string };

export type CreateReminderInput = LegacyCreateReminderInput | MultiAlertReminderInput;

export interface LegacyUpdateReminderInput {
  name?: string;
  endDate?: string;
  leadDays?: number;
  alertTime?: string;
}

export interface MultiAlertUpdateReminderInput {
  name?: string;
  dueAt?: string;
  alerts?: ReminderAlertInput[];
}

export type UpdateReminderInput = LegacyUpdateReminderInput | MultiAlertUpdateReminderInput;

export type RenewalInput = CreateReminderInput;

export interface ReminderCycle {
  reminder: Reminder;
  notification: Notification;
  alerts?: ReminderAlert[];
  notifications?: Notification[];
}

export interface ReminderMutationResult {
  reminder: Reminder;
  notification: Notification | null;
  alerts?: ReminderAlert[];
  notifications?: Notification[];
}

export interface ReminderListItem {
  reminder: Reminder;
  urgency: Urgency;
  remainingCalendarDays: number;
  scheduledEmail: Pick<Notification, 'id' | 'scheduledFor' | 'status' | 'channel'> | null;
}

export type ReminderWithNotifications = Prisma.ReminderGetPayload<{
  include: { notifications: true; alerts: true };
}>;

export type ReminderWithAlerts = Prisma.ReminderGetPayload<{
  include: { alerts: true };
}>;
