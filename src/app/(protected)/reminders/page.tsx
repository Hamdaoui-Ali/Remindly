import { RemindersPage } from '@/components/reminders/reminders-page';
import { requireUser } from '@/server/auth/require-user';
import { presentReminderList } from '@/server/reminders/presenters';
import { ReminderService } from '@/server/reminders/service';
import { ProfileService } from '@/server/profile/service';

export default async function RemindersRoutePage() {
  const user = await requireUser();
  const service = new ReminderService();
  const [reminders, settings] = await Promise.all([
    service.listActiveReminders(user.id, new Date()),
    new ProfileService().getSettings(user.id),
  ]);
  const timezone = settings.timezone;
  const presentedReminders = presentReminderList(reminders, timezone);

  return (
    <RemindersPage
      key={presentedReminders.map((reminder) => `${reminder.id}:${reminder.endDate}:${reminder.name}`).join('|')}
      reminders={presentedReminders}
      defaultAlertTime={settings.defaultAlertTime}
      timezone={timezone}
    />
  );
}
