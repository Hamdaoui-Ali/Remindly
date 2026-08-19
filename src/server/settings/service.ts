import type { Prisma, Settings } from '@/generated/prisma/client';
import { withTransaction } from '@/server/db/transaction';
import {
  cancelPendingEmailNotifications,
  createPendingEmailNotification,
} from '@/server/notifications/ledger';
import { ReminderRepository } from '@/server/reminders/repository';
import { calculateAlertAt } from '@/server/urgency/scheduling';
import { SettingsRepository } from './repository';
import {
  settingsInputSchema,
  updateSettingsSchema,
  type OwnerSettings,
  type UpdateSettingsInput,
} from './types';

export class SettingsNotConfiguredError extends Error {
  constructor() {
    super('Owner settings are not configured');
    this.name = 'SettingsNotConfiguredError';
  }
}

function present(settings: Settings): OwnerSettings {
  return {
    notificationEmail: settings.notificationEmail,
    timezone: settings.timezone,
    defaultAlertTime: settings.defaultAlertTime,
    protectedAccess: true,
  };
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

async function activeRemindersWithPendingSchedules(tx: Prisma.TransactionClient) {
  return tx.reminder.findMany({
    where: {
      status: 'ACTIVE',
      notifications: { some: { channel: 'EMAIL', status: 'PENDING' } },
    },
    orderBy: { id: 'asc' },
  });
}

export class SettingsService {
  getSettings(): Promise<OwnerSettings> {
    return withTransaction(async (tx) => {
      const settings = await new SettingsRepository(tx).getSingleton();
      if (!settings) throw new SettingsNotConfiguredError();
      return present(settings);
    });
  }

  updateSettings(input: UpdateSettingsInput): Promise<OwnerSettings> {
    const patch = updateSettingsSchema.parse(input);

    return withTransaction(async (tx) => {
      const repository = new SettingsRepository(tx);
      const current = await repository.getSingleton();
      if (!current) throw new SettingsNotConfiguredError();

      const next = settingsInputSchema.parse({
        notificationEmail: patch.notificationEmail ?? current.notificationEmail,
        timezone: patch.timezone ?? current.timezone,
        defaultAlertTime: patch.defaultAlertTime ?? current.defaultAlertTime,
      });
      const timezoneChanged = next.timezone !== current.timezone;
      const reminders = timezoneChanged ? await activeRemindersWithPendingSchedules(tx) : [];

      const updated = await repository.updateSingleton(next);

      for (const reminder of reminders) {
        const alertAt = calculateAlertAt({
          endDate: dateOnly(reminder.endDate),
          leadDays: reminder.alertLeadDays,
          alertTime: reminder.alertTime,
          timezone: next.timezone,
        });
        await cancelPendingEmailNotifications(tx, reminder.id);
        await new ReminderRepository(tx).update(reminder.id, { alertAt });
        await createPendingEmailNotification(tx, reminder.id, alertAt);
      }

      return present(updated);
    });
  }
}
