import { jsonResponse } from '@/lib/http';
import { requireOwner } from '@/server/auth/require-owner';
import { presentReminderCycle, presentReminderList } from '@/server/reminders/presenters';
import { ReminderService } from '@/server/reminders/service';
import { reminderInputSchema } from '@/server/validation/reminders';
import { reminderRouteError } from './errors';
import { presentationTimezone } from './presentation-timezone';

const service = new ReminderService();

export async function GET() {
  try {
    await requireOwner();
    const now = new Date();
    const [items, ownerTimezone] = await Promise.all([
      service.listActiveReminders(now),
      presentationTimezone(),
    ]);
    return jsonResponse({ reminders: presentReminderList(items, ownerTimezone) });
  } catch (error) {
    return reminderRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireOwner();
    const input = reminderInputSchema.parse(await request.json());
    const ownerTimezone = await presentationTimezone();
    const now = new Date();
    const cycle = await service.createReminder(input, now);
    return jsonResponse({ cycle: presentReminderCycle(cycle, ownerTimezone, now) }, 201);
  } catch (error) {
    return reminderRouteError(error);
  }
}
