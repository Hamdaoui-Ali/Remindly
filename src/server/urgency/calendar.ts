import { formatInTimeZone } from 'date-fns-tz';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidCalendarDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function getLocalDate(now: Date, timezone: string): string {
  return formatInTimeZone(now, timezone, 'yyyy-MM-dd');
}

export function calendarDayDifference(endDate: string, now: Date, timezone: string): number {
  if (!isValidCalendarDate(endDate)) throw new Error('Invalid calendar date');
  const localToday = getLocalDate(now, timezone);
  const end = Date.UTC(Number(endDate.slice(0, 4)), Number(endDate.slice(5, 7)) - 1, Number(endDate.slice(8, 10)));
  const today = Date.UTC(Number(localToday.slice(0, 4)), Number(localToday.slice(5, 7)) - 1, Number(localToday.slice(8, 10)));
  return Math.round((end - today) / 86_400_000);
}
