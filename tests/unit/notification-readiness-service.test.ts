import type { PrismaClient } from '@/generated/prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readNotificationReadiness } from '@/server/notifications/readiness-service';

const NOW = new Date('2026-09-27T12:00:00.000Z');

function database(overrides: {
  cron?: () => Promise<Array<{ active: boolean }>>;
  run?: object | null;
  overdue?: number;
} = {}) {
  return {
    $queryRaw: vi.fn(overrides.cron ?? (async () => [{ active: true }])),
    processorRun: {
      findFirst: vi.fn(async () => overrides.run ?? ({
        status: 'SUCCEEDED',
        startedAt: new Date('2026-09-27T11:59:00.000Z'),
        sanitizedFailureCode: null,
      })),
    },
    notification: {
      count: vi.fn(async () => overrides.overdue ?? 0),
    },
  } as unknown as PrismaClient;
}

beforeEach(() => {
  vi.stubEnv('DATABASE_URL', 'postgresql://localhost/remindly');
  vi.stubEnv('SCHEDULER_SECRET', 'scheduler-secret-123456');
  vi.stubEnv('APP_URL', 'https://remindly.example');
  vi.stubEnv('EMAIL_PROVIDER', 'resend');
  vi.stubEnv('RESEND_API_KEY', 're_test');
  vi.stubEnv('RESEND_FROM', 'Remindly <notifications@example.com>');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('readNotificationReadiness', () => {
  it('reads the cron job, processor heartbeat, and overdue queue', async () => {
    await expect(readNotificationReadiness(database(), NOW)).resolves.toEqual({
      ready: true,
      issues: [],
    });
  });

  it('reports a missing provider credential and absent cron schema without throwing', async () => {
    vi.stubEnv('RESEND_API_KEY', undefined);
    const db = database({
      cron: async () => { throw new Error('relation cron.job does not exist'); },
      overdue: 2,
    });

    await expect(readNotificationReadiness(db, NOW)).resolves.toEqual({
      ready: false,
      issues: [
        'configuration:notification_processor_config_RESEND_API_KEY',
        'cron:inactive',
        'notifications:overdue_pending:2',
      ],
    });
  });
});
