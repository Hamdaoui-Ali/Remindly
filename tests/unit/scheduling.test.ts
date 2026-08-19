import { describe, expect, it } from 'vitest';
import { calculateAlertAt } from '@/server/urgency/scheduling';

describe('calculateAlertAt', () => {
  it('calculates the local alert instant across a Casablanca offset change', () => {
    expect(calculateAlertAt({
      endDate: '2026-04-05', leadDays: 1, alertTime: '09:30', timezone: 'Africa/Casablanca',
    }).toISOString()).toBe('2026-04-04T08:30:00.000Z');
  });

  it('subtracts lead days from the calendar date', () => {
    expect(calculateAlertAt({
      endDate: '2026-03-01', leadDays: 1, alertTime: '09:30', timezone: 'UTC',
    }).toISOString()).toBe('2026-02-28T09:30:00.000Z');
  });
});
