import { ZodError } from 'zod';

import { errorResponse, jsonResponse } from '@/lib/http';
import { ReminderLifecycleError } from '@/server/reminders/service';

export function reminderRouteError(error: unknown) {
  if (error instanceof ZodError) {
    return jsonResponse({
      error: 'Invalid reminder input',
      fields: error.flatten().fieldErrors,
    }, 400);
  }

  if (error instanceof SyntaxError) {
    return errorResponse('Invalid JSON body', 400);
  }

  if (error instanceof ReminderLifecycleError) {
    if (error.message.toLowerCase().includes('not found')) {
      return errorResponse('Reminder not found', 404);
    }
    return errorResponse(error.message, 409);
  }

  return errorResponse('Unable to process the reminder request', 500);
}
