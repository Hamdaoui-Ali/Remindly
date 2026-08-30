import { describe, expect, it } from 'vitest';

import {
  resolveReminderAlerts,
  type ReminderAlertInput,
} from '@/server/reminders/alerts';
import {
  multiAlertReminderInputSchema,
  multiAlertReminderPatchSchema,
} from '@/server/validation/reminders';

describe('multi-alert reminder validation', () => {
  it('accepts a reminder with offset and absolute alerts', () => {
    const result = multiAlertReminderInputSchema.parse({
      name: '  Renew passport  ',
      dueAt: '2026-03-23T09:30:00+01:00',
      alerts: [
        { kind: 'offset', offsetMinutes: 60 },
        { kind: 'absolute', scheduledFor: '2026-03-20T09:30:00+01:00' },
      ],
    });

    expect(result.name).toBe('Renew passport');
    expect(result.alerts).toHaveLength(2);
  });

  it('requires a non-empty alert collection and a non-empty patch', () => {
    expect(multiAlertReminderInputSchema.safeParse({
      name: 'Renew passport',
      dueAt: '2026-03-23T09:30:00+01:00',
      alerts: [],
    }).success).toBe(false);
    expect(multiAlertReminderPatchSchema.safeParse({}).success).toBe(false);
  });

  it('rejects invalid offsets and malformed timestamps', () => {
    const base = {
      name: 'Renew passport',
      dueAt: '2026-03-23T09:30:00+01:00',
      alerts: [{ kind: 'offset', offsetMinutes: 60 }],
    };

    expect(multiAlertReminderInputSchema.safeParse({
      ...base,
      dueAt: 'not-a-timestamp',
    }).success).toBe(false);
    expect(multiAlertReminderInputSchema.safeParse({
      ...base,
      alerts: [{ kind: 'offset', offsetMinutes: 0 }],
    }).success).toBe(false);
  });
});

describe('resolveReminderAlerts', () => {
  it('resolves fixed-duration offsets from the due instant', () => {
    const alerts: ReminderAlertInput[] = [{ kind: 'offset', offsetMinutes: 90 }];

    expect(resolveReminderAlerts(
      new Date('2026-03-23T08:30:00.000Z'),
      alerts,
      'Africa/Casablanca',
    )).toEqual([{
      scheduledFor: new Date('2026-03-23T07:00:00.000Z'),
      offsetMinutes: 90,
    }]);
  });

  it('rejects duplicate schedules and alerts at or after the deadline', () => {
    const dueAt = new Date('2026-03-23T09:30:00.000Z');

    expect(() => resolveReminderAlerts(dueAt, [
      { kind: 'offset', offsetMinutes: 60 },
      { kind: 'absolute', scheduledFor: '2026-03-23T08:30:00.000Z' },
    ], 'UTC')).toThrow('Duplicate alert schedule');

    expect(() => resolveReminderAlerts(dueAt, [
      { kind: 'absolute', scheduledFor: '2026-03-23T09:30:00.000Z' },
    ], 'UTC')).toThrow('before the reminder deadline');
  });

  it('rejects more than ten alerts and invalid timezones', () => {
    const alerts = Array.from({ length: 11 }, (_, index) => ({
      kind: 'offset' as const,
      offsetMinutes: index + 1,
    }));

    expect(() => resolveReminderAlerts(
      new Date('2026-03-23T09:30:00.000Z'),
      alerts,
      'UTC',
    )).toThrow('A reminder cannot have more than 10 alerts');
    expect(() => resolveReminderAlerts(
      new Date('2026-03-23T09:30:00.000Z'),
      [{ kind: 'offset', offsetMinutes: 60 }],
      'Not/A-Timezone',
    )).toThrow('Invalid timezone');
  });
});
