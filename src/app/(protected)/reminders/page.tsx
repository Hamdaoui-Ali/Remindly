import { RemindersPage } from '@/components/reminders/reminders-page';
import { requireUser } from '@/server/auth/require-user';
import { presentReminderList } from '@/server/reminders/presenters';
import { ReminderService } from '@/server/reminders/service';
import { ProfileService } from '@/server/profile/service';

export default async function RemindersRoutePage({ searchParams }: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  const query = await searchParams;
  const service = new ReminderService();
  const now = new Date();
  const [reminders, settings] = await Promise.all([
    service.listActiveReminders(user.id, now),
    new ProfileService().getSettings(user.id),
  ]);
  const timezone = settings.timezone;
  const presentedReminders = presentReminderList(reminders, timezone);
  const openAdd = query.new === '1' || (Array.isArray(query.new) && query.new.includes('1'));
  const initialFocusId = typeof query.focus === 'string' ? query.focus : Array.isArray(query.focus) ? query.focus[0] : undefined;

  return (
    <RemindersPage
      key={presentedReminders.map((reminder) => `${reminder.id}:${reminder.endDate}:${reminder.name}`).join('|')}
      reminders={presentedReminders}
      defaultAlertTime={settings.defaultAlertTime}
      timezone={timezone}
      now={now.toISOString()}
      initiallyOpenAdd={openAdd}
      initialFocusId={initialFocusId}
    />
  );
}
