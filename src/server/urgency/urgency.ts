import { calendarDayDifference } from './calendar';
import type { Urgency } from './types';

export function calculateUrgency(endDate: string, now: Date, timezone: string): Urgency {
  const days = calendarDayDifference(endDate, now, timezone);
  if (days < 0) return 'OVERDUE';
  if (days <= 3) return 'URGENT';
  if (days <= 14) return 'SOON';
  return 'SAFE';
}
