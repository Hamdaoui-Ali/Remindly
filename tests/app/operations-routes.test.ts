// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  databaseProbe,
  configuredDelivery,
  processDueNotifications,
  readNotificationReadiness,
} = vi.hoisted(() => ({
  databaseProbe: vi.fn(),
  configuredDelivery: vi.fn(),
  processDueNotifications: vi.fn(),
  readNotificationReadiness: vi.fn(),
}));

vi.mock('@/server/db/client', () => ({
  prisma: {
    $queryRaw: databaseProbe,
    processorRun: {
      create: vi.fn(async () => ({ id: 'run-1' })),
      update: vi.fn(async () => ({ id: 'run-1' })),
    },
  },
}));
vi.mock('@/server/notifications/processor', () => ({ processDueNotifications }));
vi.mock('@/server/notifications/readiness-service', () => ({ readNotificationReadiness }));
vi.mock('@/server/email/configured-delivery', () => ({
  createConfiguredEmailDelivery: configuredDelivery,
}));

import { GET as getHealth } from '@/app/api/health/route';
import {
  notificationProcessorFailureCode,
  POST as processNotifications,
} from '@/app/api/internal/process-due-notifications/route';
import { GET as getNotificationReadiness } from '@/app/api/internal/notification-readiness/route';
import { z } from 'zod';

const environment = {
  EMAIL_PROVIDER: 'resend' as const,
  RESEND_API_KEY: 're_test',
  RESEND_FROM: 'Remindly <notifications@example.com>',
  SCHEDULER_SECRET: 'scheduler-secret-123456',
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubEnv('SCHEDULER_SECRET', environment.SCHEDULER_SECRET);
  vi.stubEnv('EMAIL_PROVIDER', environment.EMAIL_PROVIDER);
  vi.stubEnv('DATABASE_URL', 'postgresql://localhost/remindly');
  vi.stubEnv('APP_URL', 'https://remindly.example.com');
  vi.stubEnv('RESEND_API_KEY', environment.RESEND_API_KEY);
  vi.stubEnv('RESEND_FROM', environment.RESEND_FROM);
  databaseProbe.mockReset();
  processDueNotifications.mockReset();
  configuredDelivery.mockReset();
  readNotificationReadiness.mockReset();
});

describe('GET /api/internal/notification-readiness', () => {
  it('rejects requests without the scheduler secret', async () => {
    const response = await getNotificationReadiness(new Request(
      'http://localhost/api/internal/notification-readiness',
    ));

    expect(response.status).toBe(401);
    expect(readNotificationReadiness).not.toHaveBeenCalled();
  });

  it('returns sanitized readiness issues with a degraded status', async () => {
    readNotificationReadiness.mockResolvedValueOnce({
      ready: false,
      issues: [
        'configuration:notification_processor_config_RESEND_API_KEY',
        'cron:inactive',
      ],
    });

    const response = await getNotificationReadiness(new Request(
      'http://localhost/api/internal/notification-readiness',
      { headers: { 'x-scheduler-secret': environment.SCHEDULER_SECRET } },
    ));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      status: 'degraded',
      issues: [
        'configuration:notification_processor_config_RESEND_API_KEY',
        'cron:inactive',
      ],
      provider: 'resend',
    });
  });

  it('returns ready only when every notification dependency is healthy', async () => {
    readNotificationReadiness.mockResolvedValueOnce({ ready: true, issues: [] });

    const response = await getNotificationReadiness(new Request(
      'http://localhost/api/internal/notification-readiness',
      { headers: { 'x-scheduler-secret': environment.SCHEDULER_SECRET } },
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: 'ready',
      issues: [],
      provider: 'resend',
    });
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/health', () => {
  it('reports database readiness without exposing application data', async () => {
    databaseProbe.mockResolvedValueOnce([{ ready: 1 }]);

    const response = await getHealth();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ status: 'ok', database: 'ok' });
    expect(JSON.stringify(body)).not.toMatch(/secret|password|reminder|provider/i);
  });

  it('returns a degraded readiness response when the database is unavailable', async () => {
    databaseProbe.mockRejectedValueOnce(new Error('postgres connection includes private details'));

    const response = await getHealth();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      status: 'degraded',
      database: 'error',
    });
  });
});

describe('POST /api/internal/process-due-notifications', () => {
  it('identifies the invalid environment field without exposing its value', () => {
    const result = z.object({
      EMAIL_PROVIDER: z.enum(['resend', 'gmail']),
    }).safeParse({ EMAIL_PROVIDER: 'private-invalid-value' });

    expect(result.success).toBe(false);
    if (result.success) throw new Error('Expected invalid configuration');

    expect(notificationProcessorFailureCode(result.error)).toBe(
      'notification_processor_config_EMAIL_PROVIDER',
    );
    expect(notificationProcessorFailureCode(new Error('database password'))).toBe(
      'notification_processor_failed',
    );
  });

  it.each([null, 'wrong', 'scheduler-secret-123457'])(
    'rejects a missing or incorrect scheduler secret without processing (%s)',
    async (providedSecret) => {
      const response = await processNotifications(new Request(
        'http://localhost/api/internal/process-due-notifications',
        {
          method: 'POST',
          headers: providedSecret ? { 'x-scheduler-secret': providedSecret } : undefined,
        },
      ));

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
      expect(processDueNotifications).not.toHaveBeenCalled();
    },
  );

  it('rejects requests when the scheduler secret is not configured before parsing unrelated settings', async () => {
    vi.stubEnv('SCHEDULER_SECRET', undefined);

    const response = await processNotifications(new Request(
      'http://localhost/api/internal/process-due-notifications',
      {
        method: 'POST',
        headers: { 'x-scheduler-secret': environment.SCHEDULER_SECRET },
      },
    ));

    expect(response.status).toBe(401);
    expect(processDueNotifications).not.toHaveBeenCalled();
  });

  it('sanitizes unrelated configuration failures only after scheduler authentication', async () => {
    configuredDelivery.mockImplementationOnce(() => {
      throw new Error('missing database password');
    });

    const response = await processNotifications(new Request(
      'http://localhost/api/internal/process-due-notifications',
      {
        method: 'POST',
        headers: { 'x-scheduler-secret': environment.SCHEDULER_SECRET },
      },
    ));

    expect(configuredDelivery).toHaveBeenCalledOnce();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Notification processing failed',
    });
    expect(processDueNotifications).not.toHaveBeenCalled();
  });

  it('uses the configured provider and bounded batch, then returns processor counts', async () => {
    const delivery = { send: vi.fn() };
    configuredDelivery.mockReturnValueOnce(delivery);
    processDueNotifications.mockResolvedValueOnce({
      claimed: 4,
      sent: 3,
      failed: 1,
      recovered: 1,
    });

    const response = await processNotifications(new Request(
      'http://localhost/api/internal/process-due-notifications',
      {
        method: 'POST',
        headers: { 'x-scheduler-secret': environment.SCHEDULER_SECRET },
      },
    ));

    expect(configuredDelivery).toHaveBeenCalledOnce();
    expect(processDueNotifications).toHaveBeenCalledWith({
      now: expect.any(Date),
      limit: 50,
      delivery,
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      claimed: 4,
      sent: 3,
      failed: 1,
      recovered: 1,
    });
  });

  it('routes reminder delivery through the configured sandbox recipient override', async () => {
    vi.stubEnv('REMINDER_RECIPIENT_OVERRIDE', 'resend-owner@example.com');
    const send = vi.fn(async () => ({ status: 'sent' as const }));
    configuredDelivery.mockReturnValueOnce({ send });
    processDueNotifications.mockImplementationOnce(async ({ delivery }) => {
      await delivery.send('REMINDER', {
        to: 'profile@example.com',
        subject: 'Reminder',
        html: '<p>Reminder</p>',
        text: 'Reminder',
        idempotencyKey: 'notification-1',
      });
      return { claimed: 1, sent: 1, failed: 0, recovered: 0 };
    });

    const response = await processNotifications(new Request(
      'http://localhost/api/internal/process-due-notifications',
      {
        method: 'POST',
        headers: { 'x-scheduler-secret': environment.SCHEDULER_SECRET },
      },
    ));

    expect(response.status).toBe(200);
    expect(send).toHaveBeenCalledWith('REMINDER', expect.objectContaining({
      to: 'resend-owner@example.com',
    }), undefined, undefined);
  });

  it('returns a sanitized failure when processing cannot complete', async () => {
    configuredDelivery.mockReturnValueOnce({ send: vi.fn() });
    processDueNotifications.mockRejectedValueOnce(
      new Error('database password and reminder contents'),
    );

    const response = await processNotifications(new Request(
      'http://localhost/api/internal/process-due-notifications',
      {
        method: 'POST',
        headers: { 'x-scheduler-secret': environment.SCHEDULER_SECRET },
      },
    ));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Notification processing failed',
    });
  });
});
