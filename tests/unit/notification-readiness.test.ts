import { describe, expect, it } from 'vitest';

import { evaluateNotificationReadiness } from '@/server/notifications/readiness';

const NOW = new Date('2026-09-27T12:00:00.000Z');

describe('notification readiness', () => {
  it('is ready when configuration, cron, and the processor heartbeat are healthy', () => {
    expect(evaluateNotificationReadiness({
      now: NOW,
      configurationFailureCode: null,
      cronJobActive: true,
      latestProcessorRun: {
        status: 'SUCCEEDED',
        startedAt: new Date('2026-09-27T11:59:00.000Z'),
        failureCode: null,
      },
      overduePendingCount: 0,
    })).toEqual({ ready: true, issues: [] });
  });

  it('reports every condition that can silently stop reminder delivery', () => {
    expect(evaluateNotificationReadiness({
      now: NOW,
      configurationFailureCode: 'notification_processor_config_RESEND_API_KEY',
      cronJobActive: false,
      latestProcessorRun: {
        status: 'FAILED',
        startedAt: new Date('2026-09-27T11:45:00.000Z'),
        failureCode: 'notification_processor_config_RESEND_API_KEY',
      },
      overduePendingCount: 2,
    })).toEqual({
      ready: false,
      issues: [
        'configuration:notification_processor_config_RESEND_API_KEY',
        'cron:inactive',
        'processor:failed:notification_processor_config_RESEND_API_KEY',
        'processor:stale',
        'notifications:overdue_pending:2',
      ],
    });
  });

  it('reports a missing processor heartbeat', () => {
    expect(evaluateNotificationReadiness({
      now: NOW,
      configurationFailureCode: null,
      cronJobActive: true,
      latestProcessorRun: null,
      overduePendingCount: 0,
    })).toEqual({ ready: false, issues: ['processor:missing'] });
  });
});
