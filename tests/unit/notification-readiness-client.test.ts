import { describe, expect, it, vi } from 'vitest';

import {
  formatNotificationReadinessResult,
  runNotificationReadinessCheck,
} from '@/server/notifications/readiness-client';

const INPUT = {
  appUrl: 'https://remindly.example',
  schedulerSecret: 'scheduler-secret-123456',
};

describe('notification readiness client', () => {
  it('reports a ready production endpoint', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ status: 'ready', issues: [] }));

    await expect(runNotificationReadinessCheck({ ...INPUT, fetchImpl })).resolves.toEqual({
      kind: 'ready',
      issues: [],
    });
  });

  it('preserves sanitized issues from a degraded production endpoint', async () => {
    const fetchImpl = vi.fn(async () => Response.json({
      status: 'degraded',
      issues: ['cron:inactive', 'notifications:overdue_pending:2'],
    }, { status: 503 }));

    const result = await runNotificationReadinessCheck({ ...INPUT, fetchImpl });

    expect(result).toEqual({
      kind: 'degraded',
      issues: ['cron:inactive', 'notifications:overdue_pending:2'],
    });
    expect(formatNotificationReadinessResult(result)).toBe(
      'degraded: cron:inactive, notifications:overdue_pending:2',
    );
  });

  it('does not trust malformed or unreachable responses', async () => {
    const malformed = vi.fn(async () => Response.json({ status: 'ready', issues: ['secret=value'] }));
    const unavailable = vi.fn(async () => { throw new Error('network failure'); });

    await expect(runNotificationReadinessCheck({ ...INPUT, fetchImpl: malformed })).resolves.toEqual({
      kind: 'unavailable',
    });
    await expect(runNotificationReadinessCheck({ ...INPUT, fetchImpl: unavailable })).resolves.toEqual({
      kind: 'unavailable',
    });
  });
});
