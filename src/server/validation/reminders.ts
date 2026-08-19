import { z } from 'zod';
import { isValidCalendarDate } from '@/server/urgency/calendar';

export const reminderInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  leadDays: z.union([z.literal(0), z.literal(1), z.literal(3), z.literal(7), z.literal(14), z.literal(30)]),
  alertTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
}).superRefine((value, context) => {
  if (!isValidCalendarDate(value.endDate)) {
    context.addIssue({ code: 'custom', path: ['endDate'], message: 'Invalid calendar date' });
  }
});
