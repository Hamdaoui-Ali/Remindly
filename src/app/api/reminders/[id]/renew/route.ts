import { jsonResponse } from '@/lib/http';
import { requireUser } from '@/server/auth/require-user';
import { presentReminderCycle } from '@/server/reminders/presenters';
import { ReminderService } from '@/server/reminders/service';
import { multiAlertReminderInputSchema, reminderIdSchema } from '@/server/validation/reminders';
import { reminderRouteError } from '../../errors';
import { presentationTimezone } from '../../presentation-timezone';

const service = new ReminderService();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const [routeParams, input] = await Promise.all([
      params,
      request.json().then((body) => multiAlertReminderInputSchema.parse(body)),
    ]);
    const id = reminderIdSchema.parse(routeParams.id);
    const ownerTimezone = await presentationTimezone(user.id);
    const now = new Date();
    const cycle = await service.renewReminder(user.id, id, input, now);
    return jsonResponse({ cycle: presentReminderCycle(cycle, ownerTimezone, now) });
  } catch (error) {
    return reminderRouteError(error);
  }
}
