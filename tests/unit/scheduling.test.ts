import { describe, expect, it } from 'vitest';
import {
  calculateAlertAt,
  calculateLeadDays,
  calculateReminderDate,
} from '@/server/urgency/scheduling';

describe('calculateAlertAt', () => {
  it('calculates the local alert instant across a Casablanca offset change', () => {
    expect(calculateAlertAt({
      endDate: '2026-03-22', leadDays: 1, alertTime: '09:30', timezone: 'Africa/Casablanca',
    }).toISOString()).toBe('2026-03-21T09:30:00.000Z');
    expect(calculateAlertAt({
      endDate: '2026-03-23', leadDays: 1, alertTime: '09:30', timezone: 'Africa/Casablanca',
    }).toISOString()).toBe('2026-03-22T08:30:00.000Z');
  });

  it('subtracts lead days from the calendar date', () => {
    expect(calculateAlertAt({
      endDate: '2026-03-01', leadDays: 1, alertTime: '09:30', timezone: 'UTC',
    }).toISOString()).toBe('2026-02-28T09:30:00.000Z');
  });

  it('converts an exact reminder date to calendar lead days', () => {
    expect(calculateLeadDays('2026-08-26', '2026-08-23')).toBe(3);
    expect(calculateLeadDays('2028-03-01', '2028-02-29')).toBe(1);
  });

  it('reconstructs custom dates across month and leap-year boundaries', () => {
    expect(calculateReminderDate('2026-03-01', 2)).toBe('2026-02-27');
    expect(calculateReminderDate('2028-03-01', 1)).toBe('2028-02-29');
  });

  it('rejects lead days above the maximum calendar bound', () => {
    expect(() => calculateReminderDate('2026-03-01', 36_501))
      .toThrow('Invalid alert lead days');
    expect(() => calculateAlertAt({
      endDate: '2026-03-01', leadDays: 36_501, alertTime: '09:30', timezone: 'UTC',
    })).toThrow('Invalid alert lead days');
  });

  it('rejects a reminder date after the end date', () => {
    expect(() => calculateLeadDays('2026-08-23', '2026-08-24'))
      .toThrow('Reminder date must be on or before the end date');
  });
});
