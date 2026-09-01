import { describe, expect, it } from 'vitest';
import { buildLegacyReminderUpdateData } from '@/server/reminders/service';

describe('buildLegacyReminderUpdateData', () => {
  const input = {
    name: 'Renew passport',
    endDate: '2026-02-28',
    leadDays: 7,
    alertTime: '09:30',
  };
  const alertAt = new Date('2026-02-21T09:30:00.000Z');

  it('updates only the name when the schedule is unchanged', () => {
    expect(buildLegacyReminderUpdateData(input, alertAt, false)).toEqual({
      name: input.name,
    });
  });

  it('includes the recalculated schedule when it changed', () => {
    expect(buildLegacyReminderUpdateData(input, alertAt, true)).toEqual({
      name: input.name,
      endDate: new Date('2026-02-28T00:00:00.000Z'),
      alertLeadDays: input.leadDays,
      alertTime: input.alertTime,
      alertAt,
    });
  });
});
