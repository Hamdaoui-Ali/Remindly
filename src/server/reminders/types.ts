import type { Notification, Reminder } from '@/generated/prisma/client';
import type { Urgency } from '@/server/urgency/types';

export interface CreateReminderInput {
  name: string;
  endDate: string;
  leadDays: 0 | 1 | 3 | 7 | 14 | 30;
  alertTime: string;
  /** Accepted for API compatibility; schedules always use the singleton settings timezone. */
  timezone?: string;
}

export interface UpdateReminderInput {
  name?: string;
  endDate?: string;
  leadDays?: 0 | 1 | 3 | 7 | 14 | 30;
  alertTime?: string;
}

export type RenewalInput = CreateReminderInput;

export interface ReminderCycle {
  reminder: Reminder;
  notification: Notification;
}

export interface ReminderListItem {
  reminder: Reminder;
  urgency: Urgency;
  remainingCalendarDays: number;
  scheduledEmail: Pick<Notification, 'id' | 'scheduledFor' | 'status' | 'channel'> | null;
}
