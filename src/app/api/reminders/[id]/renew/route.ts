import { jsonResponse } from '@/lib/http';
import { requireOwner } from '@/server/auth/require-owner';
import { presentReminderCycle } from '@/server/reminders/presenters';
import { ReminderService } from '@/server/reminders/service';
import { reminderIdSchema, reminderInputSchema } from '@/server/validation/reminders';
import { reminderRouteError } from '../../errors';
import { presentationTimezone } from '../../presentation-timezone';

const service = new ReminderService();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireOwner();
    const [routeParams, input] = await Promise.all([
      params,
      request.json().then((body) => reminderInputSchema.parse(body)),
    ]);
    const id = reminderIdSchema.parse(routeParams.id);
    const ownerTimezone = await presentationTimezone();
    const now = new Date();
    const cycle = await service.renewReminder(id, input, now);
    return jsonResponse({ cycle: presentReminderCycle(cycle, ownerTimezone, now) });
  } catch (error) {
    return reminderRouteError(error);
  }
}
