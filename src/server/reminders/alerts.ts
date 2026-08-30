export const MAX_REMINDER_ALERTS = 10;

export type ReminderAlertInput =
  | { kind: 'offset'; offsetMinutes: number }
  | { kind: 'absolute'; scheduledFor: string };

export interface ResolvedReminderAlert {
  scheduledFor: Date;
  offsetMinutes: number | null;
}

function assertTimezone(timezone: string): void {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
  } catch {
    throw new Error('Invalid timezone');
  }
}

function assertValidDate(value: Date, message: string): void {
  if (Number.isNaN(value.getTime())) throw new Error(message);
}

export function resolveReminderAlerts(
  dueAt: Date,
  alerts: ReminderAlertInput[],
  timezone: string,
): ResolvedReminderAlert[] {
  assertValidDate(dueAt, 'Invalid reminder deadline');
  assertTimezone(timezone);
  if (alerts.length === 0) throw new Error('A reminder requires at least one alert');
  if (alerts.length > MAX_REMINDER_ALERTS) {
    throw new Error(`A reminder cannot have more than ${MAX_REMINDER_ALERTS} alerts`);
  }

  const resolved = alerts.map((alert): ResolvedReminderAlert => {
    if (alert.kind === 'offset') {
      if (!Number.isInteger(alert.offsetMinutes) || alert.offsetMinutes <= 0) {
        throw new Error('Alert offset must be a positive number of minutes');
      }
      return {
        scheduledFor: new Date(dueAt.getTime() - alert.offsetMinutes * 60_000),
        offsetMinutes: alert.offsetMinutes,
      };
    }

    const scheduledFor = new Date(alert.scheduledFor);
    assertValidDate(scheduledFor, 'Invalid alert timestamp');
    return { scheduledFor, offsetMinutes: null };
  });

  const seen = new Set<number>();
  for (const alert of resolved) {
    const timestamp = alert.scheduledFor.getTime();
    if (timestamp >= dueAt.getTime()) {
      throw new Error('Every alert must be before the reminder deadline');
    }
    if (seen.has(timestamp)) throw new Error('Duplicate alert schedule');
    seen.add(timestamp);
  }

  return resolved;
}
