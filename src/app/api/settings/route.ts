import { ZodError } from 'zod';

import { errorResponse, jsonResponse } from '@/lib/http';
import { requireOwner } from '@/server/auth/require-owner';
import { SettingsNotConfiguredError, SettingsService } from '@/server/settings/service';
import { updateSettingsSchema } from '@/server/settings/types';

const service = new SettingsService();

function settingsRouteError(error: unknown) {
  if (error instanceof ZodError) {
    return jsonResponse({
      error: 'Invalid settings input',
      fields: error.flatten().fieldErrors,
    }, 400);
  }
  if (error instanceof SyntaxError) return errorResponse('Invalid JSON body', 400);
  if (error instanceof SettingsNotConfiguredError) return errorResponse('Settings are not configured', 503);
  return errorResponse('Unable to process settings', 500);
}

export async function GET() {
  await requireOwner();
  try {
    return jsonResponse({ settings: await service.getSettings() });
  } catch (error) {
    return settingsRouteError(error);
  }
}

export async function PATCH(request: Request) {
  await requireOwner();
  try {
    const input = updateSettingsSchema.parse(await request.json());
    return jsonResponse({ settings: await service.updateSettings(input) });
  } catch (error) {
    return settingsRouteError(error);
  }
}
