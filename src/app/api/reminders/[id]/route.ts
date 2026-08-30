import { jsonResponse } from '@/lib/http';
import { requireUser } from '@/server/auth/require-user';
import { presentReminderHistory, presentReminderMutation } from '@/server/reminders/presenters';
import { ReminderService } from '@/server/reminders/service';
import { reminderIdSchema, reminderPatchSchema } from '@/server/validation/reminders';
import { reminderRouteError } from '../errors';
import { presentationTimezone } from '../presentation-timezone';

const service = new ReminderService();

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const id = reminderIdSchema.parse((await context.params).id);
    return jsonResponse({ reminder: presentReminderHistory(await service.getReminderWithHistory(user.id, id)) });
  } catch (error) {
    return reminderRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const [routeParams, patch] = await Promise.all([
      context.params,
      request.json().then((body) => reminderPatchSchema.parse(body)),
    ]);
    const id = reminderIdSchema.parse(routeParams.id);
    const ownerTimezone = await presentationTimezone(user.id);
    const now = new Date();
    const result = await service.updateReminder(user.id, id, patch, now);
    return jsonResponse({ reminder: presentReminderMutation(result, ownerTimezone, now) });
  } catch (error) {
    return reminderRouteError(error);
  }
}
