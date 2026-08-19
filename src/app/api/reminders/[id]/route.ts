import { jsonResponse } from '@/lib/http';
import { requireOwner } from '@/server/auth/require-owner';
import { presentReminder, presentReminderHistory } from '@/server/reminders/presenters';
import { ReminderService } from '@/server/reminders/service';
import { reminderPatchSchema } from '@/server/validation/reminders';
import { reminderRouteError } from '../errors';

const service = new ReminderService();

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireOwner();
    const { id } = await context.params;
    return jsonResponse({ reminder: presentReminderHistory(await service.getReminderWithHistory(id)) });
  } catch (error) {
    return reminderRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await requireOwner();
    const [{ id }, patch] = await Promise.all([
      context.params,
      request.json().then((body) => reminderPatchSchema.parse(body)),
    ]);
    return jsonResponse({ reminder: presentReminder(await service.updateReminder(id, patch, new Date())) });
  } catch (error) {
    return reminderRouteError(error);
  }
}
