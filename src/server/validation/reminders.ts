import { z } from 'zod';
import { isValidCalendarDate } from '@/server/urgency/calendar';

export const alertTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a time in 24-hour HH:MM format');
export const MAX_ALERT_LEAD_DAYS = 36_500;
export const alertLeadDaysSchema = z.number().int().min(0).max(MAX_ALERT_LEAD_DAYS);

const reminderFields = z.object({
  name: z.string().trim().min(1).max(120),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  leadDays: alertLeadDaysSchema,
  alertTime: alertTimeSchema,
});

function validateEndDate(value: { endDate?: string }, context: z.RefinementCtx) {
  if (value.endDate !== undefined && !isValidCalendarDate(value.endDate)) {
    context.addIssue({ code: 'custom', path: ['endDate'], message: 'Invalid calendar date' });
  }
}

export const reminderInputSchema = reminderFields.superRefine((value, context) => {
  if (!isValidCalendarDate(value.endDate)) {
    context.addIssue({ code: 'custom', path: ['endDate'], message: 'Invalid calendar date' });
  }
});

export const reminderPatchSchema = reminderFields.partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' })
  .superRefine(validateEndDate);

export const reminderIdSchema = z.string().uuid();
