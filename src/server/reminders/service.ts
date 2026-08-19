import type { Prisma, Reminder } from '@/generated/prisma/client';
import { withTransaction } from '@/server/db/transaction';
import {
  cancelPendingEmailNotifications,
  createPendingEmailNotification,
} from '@/server/notifications/ledger';
import { NotificationRepository } from '@/server/notifications/repository';
import { SettingsRepository } from '@/server/settings/repository';
import { calendarDayDifference } from '@/server/urgency/calendar';
import { calculateAlertAt } from '@/server/urgency/scheduling';
import { calculateUrgency } from '@/server/urgency/urgency';
import { reminderInputSchema } from '@/server/validation/reminders';
import { ReminderRepository } from './repository';
import type {
  CreateReminderInput,
  ReminderCycle,
  ReminderListItem,
  ReminderMutationResult,
  ReminderWithNotifications,
  RenewalInput,
  UpdateReminderInput,
} from './types';

export class ReminderLifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReminderLifecycleError';
  }
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toDatabaseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function configuredTimezone(settings: { timezone: string } | null): string {
  if (!settings) throw new ReminderLifecycleError('Reminder settings are not configured');
  try {
    Intl.DateTimeFormat(undefined, { timeZone: settings.timezone });
  } catch {
    throw new ReminderLifecycleError('Configured timezone is invalid');
  }
  return settings.timezone;
}

function validInput(input: CreateReminderInput) {
  return reminderInputSchema.parse({
    name: input.name,
    endDate: input.endDate,
    leadDays: input.leadDays,
    alertTime: input.alertTime,
  });
}

function schedule(input: CreateReminderInput, timezone: string) {
  const validated = validInput(input);
  return {
    validated,
    alertAt: calculateAlertAt({ ...validated, timezone }),
  };
}

function assertEditable(reminder: Reminder): void {
  if (reminder.status === 'ARCHIVED') {
    throw new ReminderLifecycleError('An archived reminder cannot be edited');
  }
  if (reminder.status !== 'ACTIVE') {
    throw new ReminderLifecycleError('Only active reminders can be edited');
  }
}

function assertCompletable(reminder: Reminder): void {
  if (reminder.status === 'ARCHIVED') {
    throw new ReminderLifecycleError('An archived reminder cannot be completed');
  }
  if (reminder.status !== 'ACTIVE') {
    throw new ReminderLifecycleError('Only active reminders can be completed');
  }
}

function assertRenewable(reminder: Reminder): void {
  if (reminder.status === 'ARCHIVED') {
    throw new ReminderLifecycleError('An archived reminder cannot be renewed');
  }
  if (reminder.status !== 'ACTIVE' && reminder.status !== 'DONE') {
    throw new ReminderLifecycleError('Only active or done reminders can be renewed');
  }
}

function requireReminder(reminder: Reminder | null): Reminder {
  if (!reminder) throw new ReminderLifecycleError('Reminder not found');
  return reminder;
}

function requireActiveTransition(count: number): void {
  if (count !== 1) throw new ReminderLifecycleError('Reminder state changed; retry the request');
}

export class ReminderService {
  getReminderWithHistory(id: string): Promise<ReminderWithNotifications> {
    return withTransaction(async (tx) => {
      const reminder = await new ReminderRepository(tx).findByIdWithNotifications(id);
      if (!reminder) throw new ReminderLifecycleError('Reminder not found');
      return reminder;
    });
  }

  createReminder(input: CreateReminderInput, now: Date): Promise<ReminderCycle> {
    void now;
    return withTransaction(async (tx) => this.createCycle(tx, input));
  }

  updateReminder(id: string, patch: UpdateReminderInput, now: Date): Promise<ReminderMutationResult> {
    void now;
    return withTransaction(async (tx) => {
      const reminders = new ReminderRepository(tx);
      const current = requireReminder(await reminders.findById(id));
      assertEditable(current);

      const merged: CreateReminderInput = {
        name: patch.name ?? current.name,
        endDate: patch.endDate ?? dateOnly(current.endDate),
        leadDays: patch.leadDays ?? current.alertLeadDays as CreateReminderInput['leadDays'],
        alertTime: patch.alertTime ?? current.alertTime,
      };
      const timezone = configuredTimezone(await new SettingsRepository(tx).getSingleton());
      const next = schedule(merged, timezone);
      const scheduleChanged = next.validated.endDate !== dateOnly(current.endDate)
        || next.validated.leadDays !== current.alertLeadDays
        || next.validated.alertTime !== current.alertTime;
      requireActiveTransition(await reminders.updateWhenStatus(id, ['ACTIVE'], {
        name: next.validated.name,
        ...(scheduleChanged
          ? {
              endDate: toDatabaseDate(next.validated.endDate),
              alertLeadDays: next.validated.leadDays,
              alertTime: next.validated.alertTime,
              alertAt: next.alertAt,
          }
          : {}),
      }));

      let notification;
      if (scheduleChanged) {
        await cancelPendingEmailNotifications(tx, current.id);
        notification = await createPendingEmailNotification(tx, current.id, next.alertAt);
      } else {
        notification = await new NotificationRepository(tx).findForReminderSchedule(current.id, current.alertAt);
      }
      return {
        reminder: requireReminder(await reminders.findById(id)),
        notification,
      };
    });
  }

  completeReminder(id: string, now: Date): Promise<Reminder> {
    return withTransaction(async (tx) => {
      const reminders = new ReminderRepository(tx);
      const current = requireReminder(await reminders.findById(id));
      assertCompletable(current);
      requireActiveTransition(await reminders.updateWhenStatus(id, ['ACTIVE'], {
        status: 'DONE',
        completedAt: now,
      }));
      await cancelPendingEmailNotifications(tx, id);
      return requireReminder(await reminders.findById(id));
    });
  }

  renewReminder(id: string, input: RenewalInput, now: Date): Promise<ReminderCycle> {
    void now;
    return withTransaction(async (tx) => {
      const reminders = new ReminderRepository(tx);
      const source = requireReminder(await reminders.findById(id));
      assertRenewable(source);
      requireActiveTransition(await reminders.updateWhenStatus(source.id, [source.status], {
        status: 'ARCHIVED',
      }));
      await cancelPendingEmailNotifications(tx, source.id);
      return this.createCycle(tx, input, source.id);
    });
  }

  listActiveReminders(now: Date): Promise<ReminderListItem[]> {
    return withTransaction(async (tx) => {
      const [timezone, reminders] = await Promise.all([
        new SettingsRepository(tx).getSingleton().then(configuredTimezone),
        new ReminderRepository(tx).listActive(),
      ]);
      const currentNotifications = await new NotificationRepository(tx).findCurrentForReminders(reminders);
      const notificationBySchedule = new Map(currentNotifications.map((notification) => [
        `${notification.reminderId}:${notification.scheduledFor.toISOString()}`,
        notification,
      ]));

      return reminders.map((reminder) => {
        const notification = notificationBySchedule.get(`${reminder.id}:${reminder.alertAt.toISOString()}`);
        return {
          reminder,
          urgency: calculateUrgency(dateOnly(reminder.endDate), now, timezone),
          remainingCalendarDays: calendarDayDifference(dateOnly(reminder.endDate), now, timezone),
          scheduledEmail: notification
            ? {
                id: notification.id,
                scheduledFor: notification.scheduledFor,
                status: notification.status,
                channel: notification.channel,
              }
            : null,
        };
      });
    });
  }

  private async createCycle(
    tx: Prisma.TransactionClient,
    input: CreateReminderInput,
    parentReminderId?: string,
  ): Promise<ReminderCycle> {
    const timezone = configuredTimezone(await new SettingsRepository(tx).getSingleton());
    const next = schedule(input, timezone);
    const reminder = await new ReminderRepository(tx).create({
      name: next.validated.name,
      endDate: toDatabaseDate(next.validated.endDate),
      alertLeadDays: next.validated.leadDays,
      alertTime: next.validated.alertTime,
      alertAt: next.alertAt,
      ...(parentReminderId ? { parentReminderId } : {}),
    });
    const notification = await createPendingEmailNotification(tx, reminder.id, reminder.alertAt);
    return { reminder, notification };
  }
}
