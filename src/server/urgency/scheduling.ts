import { fromZonedTime } from 'date-fns-tz';
import { isValidCalendarDate } from './calendar';

const MILLISECONDS_PER_DAY = 86_400_000;
export const MAX_ALERT_LEAD_DAYS = 36_500;

export interface AlertScheduleInput {
  endDate: string;
  leadDays: number;
  alertTime: string;
  timezone: string;
}

function calendarDateMilliseconds(value: string): number {
  if (!isValidCalendarDate(value)) throw new Error('Invalid calendar date');
  return Date.UTC(
    Number(value.slice(0, 4)),
    Number(value.slice(5, 7)) - 1,
    Number(value.slice(8, 10)),
  );
}

export function calculateLeadDays(endDate: string, reminderDate: string): number {
  const difference = (calendarDateMilliseconds(endDate) - calendarDateMilliseconds(reminderDate))
    / MILLISECONDS_PER_DAY;
  if (difference < 0) throw new Error('Reminder date must be on or before the end date');
  return difference;
}

export function calculateReminderDate(endDate: string, leadDays: number): string {
  if (!Number.isInteger(leadDays) || leadDays < 0 || leadDays > MAX_ALERT_LEAD_DAYS) {
    throw new Error('Invalid alert lead days');
  }
  return new Date(calendarDateMilliseconds(endDate) - leadDays * MILLISECONDS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

export function calculateAlertAt(input: AlertScheduleInput): Date {
  const alertDate = calculateReminderDate(input.endDate, input.leadDays);
  return fromZonedTime(`${alertDate}T${input.alertTime}:00`, input.timezone);
}
