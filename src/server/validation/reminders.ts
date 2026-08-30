import { z } from 'zod';
import { MAX_REMINDER_ALERTS } from '@/server/reminders/alerts';
import { isValidCalendarDate } from '@/server/urgency/calendar';
import { MAX_ALERT_LEAD_DAYS } from '@/server/urgency/scheduling';

export const alertTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a time in 24-hour HH:MM format');
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

const reminderTimestampSchema = z.string().datetime({ offset: true });
const reminderAlertInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('offset'), offsetMinutes: z.number().int().positive() }),
  z.object({ kind: z.literal('absolute'), scheduledFor: reminderTimestampSchema }),
]);

const multiAlertReminderFields = z.object({
  name: z.string().trim().min(1).max(120),
  dueAt: reminderTimestampSchema,
  alerts: z.array(reminderAlertInputSchema).min(1).max(MAX_REMINDER_ALERTS),
});

export const multiAlertReminderInputSchema = multiAlertReminderFields;
export const multiAlertReminderPatchSchema = multiAlertReminderFields
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });
