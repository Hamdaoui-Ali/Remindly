import { describe, expect, it } from 'vitest';
import { relativeTime } from '@/server/reminders/relative-time';

describe('relativeTime', () => {
  it.each([
    [-2, '2 days overdue'],
    [-1, '1 day overdue'],
    [0, 'Due today'],
    [1, '1 day left'],
    [2, '2 days left'],
  ])('formats %s calendar days', (days, expected) => {
    expect(relativeTime(days)).toBe(expected);
  });
});
