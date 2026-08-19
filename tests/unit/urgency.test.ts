import { describe, expect, it } from 'vitest';
import { calculateUrgency } from '@/server/urgency/urgency';

describe('calculateUrgency', () => {
  const now = new Date('2026-08-19T12:00:00.000Z');

  it.each([
    ['2026-08-18', 'OVERDUE'],
    ['2026-08-19', 'URGENT'],
    ['2026-08-22', 'URGENT'],
    ['2026-08-23', 'SOON'],
    ['2026-09-02', 'SOON'],
    ['2026-09-03', 'SAFE'],
  ])('maps %s to %s', (endDate, expected) => {
    expect(calculateUrgency(endDate, now, 'Africa/Casablanca')).toBe(expected);
  });
});
