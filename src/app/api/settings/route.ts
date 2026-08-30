import { ZodError } from 'zod';

import { errorResponse, jsonResponse } from '@/lib/http';
import { requireUser } from '@/server/auth/require-user';
import { ProfileNotConfiguredError, ProfileService } from '@/server/profile/service';
import type { UpdateUserSettingsInput } from '@/server/profile/service';

const service = new ProfileService();

function settingsRouteError(error: unknown) {
  if (error instanceof ZodError) {
    return jsonResponse({
      error: 'Invalid settings input',
      fields: error.flatten().fieldErrors,
    }, 400);
  }
  if (error instanceof SyntaxError) return errorResponse('Invalid JSON body', 400);
  if (error instanceof ProfileNotConfiguredError) return errorResponse('Settings are not configured', 503);
  return errorResponse('Unable to process settings', 500);
}

export async function GET() {
  const user = await requireUser();
  try {
    return jsonResponse({ settings: await service.getSettings(user.id) });
  } catch (error) {
    return settingsRouteError(error);
  }
}

export async function PATCH(request: Request) {
  const user = await requireUser();
  try {
    const input = await request.json() as UpdateUserSettingsInput;
    return jsonResponse({ settings: await service.updateSettings(user.id, input) });
  } catch (error) {
    return settingsRouteError(error);
  }
}
