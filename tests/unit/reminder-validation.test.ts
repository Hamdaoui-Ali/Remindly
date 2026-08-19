import { describe, expect, it } from 'vitest';
import { reminderInputSchema } from '@/server/validation/reminders';

describe('reminderInputSchema', () => {
  const valid = { name: '  Renew passport  ', endDate: '2026-02-28', leadDays: 7, alertTime: '09:30' };

  it('trims the name and accepts a valid reminder', () => {
    expect(reminderInputSchema.parse(valid)).toEqual({ ...valid, name: 'Renew passport' });
  });

  it.each([
    { name: '', endDate: '2026-02-28', leadDays: 7, alertTime: '09:30' },
    { name: 'a'.repeat(121), endDate: '2026-02-28', leadDays: 7, alertTime: '09:30' },
    { name: 'Valid', endDate: '2026-02-30', leadDays: 7, alertTime: '09:30' },
    { name: 'Valid', endDate: '2026-02-28', leadDays: 2, alertTime: '09:30' },
    { name: 'Valid', endDate: '2026-02-28', leadDays: 7, alertTime: '24:00' },
  ])('rejects invalid input %#', (input) => {
    expect(reminderInputSchema.safeParse(input).success).toBe(false);
  });
});
