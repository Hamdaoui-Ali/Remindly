import { jsonResponse } from '@/lib/http';
import { requireUser } from '@/server/auth/require-user';
import { presentReminder } from '@/server/reminders/presenters';
import { ReminderService } from '@/server/reminders/service';
import { reminderIdSchema } from '@/server/validation/reminders';
import { reminderRouteError } from '../../errors';

const service = new ReminderService();

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const id = reminderIdSchema.parse((await params).id);
    return jsonResponse({ reminder: presentReminder(await service.completeReminder(user.id, id, new Date())) });
  } catch (error) {
    return reminderRouteError(error);
  }
}
