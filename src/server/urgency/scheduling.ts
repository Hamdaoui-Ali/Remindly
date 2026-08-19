import { parseISO, subDays } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { isValidCalendarDate } from './calendar';

export function calculateAlertAt(input: {
  endDate: string;
  leadDays: number;
  alertTime: string;
  timezone: string;
}): Date {
  if (!isValidCalendarDate(input.endDate)) throw new Error('Invalid calendar date');
  const alertDate = formatInTimeZone(subDays(parseISO(`${input.endDate}T00:00:00Z`), input.leadDays), 'UTC', 'yyyy-MM-dd');
  return fromZonedTime(`${alertDate}T${input.alertTime}:00`, input.timezone);
}
