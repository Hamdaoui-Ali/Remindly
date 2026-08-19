import { z } from 'zod';

import { alertTimeSchema } from '@/server/validation/reminders';

export interface OwnerSettings {
  notificationEmail: string;
  timezone: string;
  defaultAlertTime: string;
  protectedAccess: true;
}

export interface UpdateSettingsInput {
  notificationEmail?: string;
  timezone?: string;
  defaultAlertTime?: string;
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

export const settingsInputSchema = z.object({
  notificationEmail: z.string().trim().email('Enter a valid email address'),
  timezone: z.string().trim().min(1, 'Enter a timezone').refine(isValidTimezone, 'Enter a valid IANA timezone'),
  defaultAlertTime: alertTimeSchema,
});

export const updateSettingsSchema = settingsInputSchema.partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one setting is required' });
