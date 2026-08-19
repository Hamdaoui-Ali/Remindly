import { jsonResponse } from '@/lib/http';
import { requireOwner } from '@/server/auth/require-owner';
import { prisma } from '@/server/db/client';
import { presentReminderCycle } from '@/server/reminders/presenters';
import { ReminderService } from '@/server/reminders/service';
import { SettingsRepository } from '@/server/settings/repository';
import { reminderInputSchema } from '@/server/validation/reminders';
import { reminderRouteError } from '../../errors';

const service = new ReminderService();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireOwner();
    const [{ id }, input] = await Promise.all([
      params,
      request.json().then((body) => reminderInputSchema.parse(body)),
    ]);
    const cycle = await service.renewReminder(id, input, new Date());
    const ownerTimezone = (await new SettingsRepository(prisma).getSingleton())?.timezone ?? 'UTC';
    return jsonResponse({ cycle: presentReminderCycle(cycle, ownerTimezone) });
  } catch (error) {
    return reminderRouteError(error);
  }
}
