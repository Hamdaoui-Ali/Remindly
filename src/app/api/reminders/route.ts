import { jsonResponse } from '@/lib/http';
import { requireOwner } from '@/server/auth/require-owner';
import { prisma } from '@/server/db/client';
import { presentReminderCycle, presentReminderList } from '@/server/reminders/presenters';
import { ReminderService } from '@/server/reminders/service';
import { SettingsRepository } from '@/server/settings/repository';
import { reminderInputSchema } from '@/server/validation/reminders';
import { reminderRouteError } from './errors';

const service = new ReminderService();

async function timezone() {
  return (await new SettingsRepository(prisma).getSingleton())?.timezone ?? 'UTC';
}

export async function GET() {
  try {
    await requireOwner();
    const now = new Date();
    const [items, ownerTimezone] = await Promise.all([
      service.listActiveReminders(now),
      timezone(),
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
    const [cycle, ownerTimezone] = await Promise.all([
      service.createReminder(input, new Date()),
      timezone(),
    ]);
    return jsonResponse({ cycle: presentReminderCycle(cycle, ownerTimezone) }, 201);
  } catch (error) {
    return reminderRouteError(error);
  }
}
