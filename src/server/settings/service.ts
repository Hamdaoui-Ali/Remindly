import type { Prisma, Settings } from '@/generated/prisma/client';
import { withTransaction } from '@/server/db/transaction';
import {
  cancelPendingEmailNotifications,
  createPendingEmailNotification,
} from '@/server/notifications/ledger';
import { ReminderRepository } from '@/server/reminders/repository';
import { calculateAlertAt } from '@/server/urgency/scheduling';
import { SettingsRepository, SETTINGS_SINGLETON_ID } from './repository';
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

async function lockSettingsSingleton(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$queryRaw`
    SELECT id
    FROM settings
    WHERE id = ${SETTINGS_SINGLETON_ID}
    FOR UPDATE
  `;
}

async function activeRemindersWithPendingSchedules(tx: Prisma.TransactionClient) {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT reminder.id
    FROM reminders AS reminder
    WHERE reminder.status = CAST('ACTIVE' AS "ReminderStatus")
      AND EXISTS (
        SELECT 1
        FROM notifications AS notification
        WHERE notification.reminder_id = reminder.id
          AND notification.channel = CAST('EMAIL' AS "NotificationChannel")
          AND notification.status = CAST('PENDING' AS "NotificationStatus")
      )
    ORDER BY reminder.id
    FOR UPDATE OF reminder
  `;

  if (locked.length === 0) return [];
  return tx.reminder.findMany({
    where: { id: { in: locked.map(({ id }) => id) } },
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
      await lockSettingsSingleton(tx);
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
