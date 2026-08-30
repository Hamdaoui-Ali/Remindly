import { jsonResponse } from '@/lib/http';
import { requireUser } from '@/server/auth/require-user';
import { presentReminderCycle, presentReminderList } from '@/server/reminders/presenters';
import { ReminderService } from '@/server/reminders/service';
import { multiAlertReminderInputSchema } from '@/server/validation/reminders';
import { reminderRouteError } from './errors';
import { presentationTimezone } from './presentation-timezone';

const service = new ReminderService();

export async function GET() {
  try {
    const user = await requireUser();
    const now = new Date();
    const [items, ownerTimezone] = await Promise.all([
      service.listActiveReminders(user.id, now),
      presentationTimezone(user.id),
    ]);
    return jsonResponse({ reminders: presentReminderList(items, ownerTimezone) });
  } catch (error) {
    return reminderRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = multiAlertReminderInputSchema.parse(await request.json());
    const ownerTimezone = await presentationTimezone(user.id);
    const now = new Date();
    const cycle = await service.createReminder(user.id, input, now);
    return jsonResponse({ cycle: presentReminderCycle(cycle, ownerTimezone, now) }, 201);
  } catch (error) {
    return reminderRouteError(error);
  }
}
