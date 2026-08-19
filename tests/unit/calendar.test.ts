import { describe, expect, it } from 'vitest';
import { calendarDayDifference, getLocalDate } from '@/server/urgency/calendar';

describe('calendar utilities', () => {
  it('returns the local date in the configured timezone', () => {
    expect(getLocalDate(new Date('2026-08-19T23:30:00.000Z'), 'Africa/Casablanca')).toBe('2026-08-20');
  });

  it('computes calendar days rather than elapsed 24-hour periods', () => {
    expect(calendarDayDifference('2026-08-20', new Date('2026-08-19T23:30:00.000Z'), 'Africa/Casablanca')).toBe(0);
  });

  it('rejects impossible end dates', () => {
    expect(() => calendarDayDifference('2026-02-30', new Date('2026-08-19T12:00:00.000Z'), 'Africa/Casablanca')).toThrow();
  });
});
