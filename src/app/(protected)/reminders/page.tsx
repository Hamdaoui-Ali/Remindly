import { RemindersPage } from '@/components/reminders/reminders-page';
import { prisma } from '@/server/db/client';
import { presentReminderList } from '@/server/reminders/presenters';
import { ReminderService } from '@/server/reminders/service';
import { SettingsRepository } from '@/server/settings/repository';

export default async function RemindersRoutePage() {
  const service = new ReminderService();
  const [reminders, settings] = await Promise.all([
    service.listActiveReminders(new Date()),
    new SettingsRepository(prisma).getSingleton(),
  ]);
  const timezone = settings?.timezone ?? 'UTC';
  const presentedReminders = presentReminderList(reminders, timezone);

  return (
    <RemindersPage
      key={presentedReminders.map((reminder) => `${reminder.id}:${reminder.endDate}:${reminder.name}`).join('|')}
      reminders={presentedReminders}
      defaultAlertTime={settings?.defaultAlertTime ?? '09:00'}
      timezone={timezone}
    />
  );
}
