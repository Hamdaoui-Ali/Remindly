import type { Prisma, Reminder } from '@/generated/prisma/client';
import { withTransaction } from '@/server/db/transaction';
import {
  cancelPendingEmailNotifications,
  createPendingEmailNotification,
} from '@/server/notifications/ledger';
import { NotificationRepository } from '@/server/notifications/repository';
import { ProfileRepository } from '@/server/profile/repository';
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
  getReminderWithHistory(userIdOrId: string, maybeId?: string): Promise<ReminderWithNotifications> {
    const userId = maybeId ? userIdOrId : undefined;
    const id = maybeId ?? userIdOrId;
    return withTransaction(async (tx) => {
      const reminders = new ReminderRepository(tx);
      const reminder = userId
        ? await reminders.findByIdWithNotifications(userId, id)
        : await reminders.findByIdWithNotifications(id);
      if (!reminder) throw new ReminderLifecycleError('Reminder not found');
      return reminder;
    });
  }

  createReminder(
    userIdOrInput: string | CreateReminderInput,
    inputOrNow: CreateReminderInput | Date,
    maybeNow?: Date,
  ): Promise<ReminderCycle> {
    const userId = typeof userIdOrInput === 'string' ? userIdOrInput : undefined;
    const input = typeof userIdOrInput === 'string' ? inputOrNow as CreateReminderInput : userIdOrInput;
    const now = typeof userIdOrInput === 'string' ? maybeNow! : inputOrNow as Date;
    void now;
    return withTransaction(async (tx) => this.createCycle(tx, userId, input));
  }

  updateReminder(
    userIdOrId: string,
    idOrPatch: string | UpdateReminderInput,
    patchOrNow: UpdateReminderInput | Date,
    maybeNow?: Date,
  ): Promise<ReminderMutationResult> {
    const userId = typeof idOrPatch === 'string' ? userIdOrId : undefined;
    const id = typeof idOrPatch === 'string' ? idOrPatch : userIdOrId;
    const patch = typeof idOrPatch === 'string' ? patchOrNow as UpdateReminderInput : idOrPatch;
    const now = typeof idOrPatch === 'string' ? maybeNow! : patchOrNow as Date;
    void now;
    return withTransaction(async (tx) => {
      const reminders = new ReminderRepository(tx);
      const current = requireReminder(userId
        ? await reminders.findById(userId, id)
        : await reminders.findById(id));
      assertEditable(current);

      const merged: CreateReminderInput = {
        name: patch.name ?? current.name,
        endDate: patch.endDate ?? dateOnly(current.endDate),
        leadDays: patch.leadDays ?? current.alertLeadDays as CreateReminderInput['leadDays'],
        alertTime: patch.alertTime ?? current.alertTime,
      };
      const timezone = configuredTimezone(userId
        ? await new ProfileRepository(tx).findById(userId)
        : await new SettingsRepository(tx).getSingleton());
      const next = schedule(merged, timezone);
      const scheduleChanged = next.validated.endDate !== dateOnly(current.endDate)
        || next.validated.leadDays !== current.alertLeadDays
        || next.validated.alertTime !== current.alertTime;
      requireActiveTransition(await (userId
        ? reminders.updateWhenStatus(userId, id, ['ACTIVE'], {
          name: next.validated.name,
          ...(scheduleChanged
            ? {
                endDate: toDatabaseDate(next.validated.endDate),
                alertLeadDays: next.validated.leadDays,
                alertTime: next.validated.alertTime,
                alertAt: next.alertAt,
              }
            : {}),
        })
        : reminders.updateWhenStatus(id, ['ACTIVE'], {
        name: next.validated.name,
        ...(scheduleChanged
          ? {
              endDate: toDatabaseDate(next.validated.endDate),
              alertLeadDays: next.validated.leadDays,
              alertTime: next.validated.alertTime,
              alertAt: next.alertAt,
          }
          : {}),
          }))); 

      let notification;
      if (scheduleChanged) {
        await cancelPendingEmailNotifications(tx, current.id);
        notification = await createPendingEmailNotification(tx, current.id, next.alertAt);
      } else {
        notification = await new NotificationRepository(tx).findForReminderSchedule(current.id, current.alertAt);
      }
      return {
        reminder: requireReminder(userId
          ? await reminders.findById(userId, id)
          : await reminders.findById(id)),
        notification,
      };
    });
  }

  completeReminder(userIdOrId: string, idOrNow: string | Date, maybeNow?: Date): Promise<Reminder> {
    const userId = typeof idOrNow === 'string' ? userIdOrId : undefined;
    const id = typeof idOrNow === 'string' ? idOrNow : userIdOrId;
    const now = typeof idOrNow === 'string' ? maybeNow! : idOrNow;
    return withTransaction(async (tx) => {
      const reminders = new ReminderRepository(tx);
      const current = requireReminder(userId
        ? await reminders.findById(userId, id)
        : await reminders.findById(id));
      assertCompletable(current);
      requireActiveTransition(await (userId
        ? reminders.updateWhenStatus(userId, id, ['ACTIVE'], {
          status: 'DONE',
          completedAt: now,
        })
        : reminders.updateWhenStatus(id, ['ACTIVE'], {
        status: 'DONE',
        completedAt: now,
        })));
      await cancelPendingEmailNotifications(tx, id);
      return requireReminder(userId
        ? await reminders.findById(userId, id)
        : await reminders.findById(id));
    });
  }

  renewReminder(
    userIdOrId: string,
    idOrInput: string | RenewalInput,
    inputOrNow: RenewalInput | Date,
    maybeNow?: Date,
  ): Promise<ReminderCycle> {
    const userId = typeof idOrInput === 'string' ? userIdOrId : undefined;
    const id = typeof idOrInput === 'string' ? idOrInput : userIdOrId;
    const input = typeof idOrInput === 'string' ? inputOrNow as RenewalInput : idOrInput;
    const now = typeof idOrInput === 'string' ? maybeNow! : inputOrNow as Date;
    void now;
    return withTransaction(async (tx) => {
      const reminders = new ReminderRepository(tx);
      const source = requireReminder(userId
        ? await reminders.findById(userId, id)
        : await reminders.findById(id));
      assertRenewable(source);
      requireActiveTransition(await (userId
        ? reminders.updateWhenStatus(userId, source.id, [source.status], {
          status: 'ARCHIVED',
        })
        : reminders.updateWhenStatus(source.id, [source.status], {
        status: 'ARCHIVED',
        })));
      await cancelPendingEmailNotifications(tx, source.id);
      return this.createCycle(tx, userId, input, source.id);
    });
  }

  listActiveReminders(userIdOrNow: string | Date, maybeNow?: Date): Promise<ReminderListItem[]> {
    const userId = typeof userIdOrNow === 'string' ? userIdOrNow : undefined;
    const now = typeof userIdOrNow === 'string' ? maybeNow! : userIdOrNow;
    return withTransaction(async (tx) => {
      const [timezone, reminders] = await Promise.all([
        (userId
          ? new ProfileRepository(tx).findById(userId)
          : new SettingsRepository(tx).getSingleton()).then(configuredTimezone),
        new ReminderRepository(tx).listActive(userId),
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
    userId: string | undefined,
    input: CreateReminderInput,
    parentReminderId?: string,
  ): Promise<ReminderCycle> {
    const timezone = configuredTimezone(userId
      ? await new ProfileRepository(tx).findById(userId)
      : await new SettingsRepository(tx).getSingleton());
    const next = schedule(input, timezone);
    const reminderInput = {
      name: next.validated.name,
      endDate: toDatabaseDate(next.validated.endDate),
      alertLeadDays: next.validated.leadDays,
      alertTime: next.validated.alertTime,
      alertAt: next.alertAt,
      ...(parentReminderId ? { parentReminderId } : {}),
    };
    const reminder = await new ReminderRepository(tx).create(userId ? userId : reminderInput, userId ? reminderInput : undefined);
    const notification = await createPendingEmailNotification(tx, reminder.id, reminder.alertAt);
    return { reminder, notification };
  }
}
