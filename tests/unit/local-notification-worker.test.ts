import { describe, expect, it, vi } from 'vitest';
import {
  LOCAL_NOTIFICATION_POLL_INTERVAL_MILLISECONDS,
  localNotificationWorkerConfig,
  runLocalNotificationWorker,
} from '@/server/notifications/local-worker';

describe('localNotificationWorkerConfig', () => {
  it('accepts the local URL and a strong scheduler secret', () => {
    expect(localNotificationWorkerConfig({
      APP_URL: 'http://localhost:3000',
      SCHEDULER_SECRET: 'scheduler-secret-123456',
    })).toEqual({
      appUrl: 'http://localhost:3000',
      schedulerSecret: 'scheduler-secret-123456',
    });
  });

  it.each([
    [{ SCHEDULER_SECRET: 'scheduler-secret-123456' }, 'APP_URL must be configured'],
    [{ APP_URL: 'not a URL', SCHEDULER_SECRET: 'scheduler-secret-123456' }, 'APP_URL must be a valid URL'],
    [{ APP_URL: 'http://localhost:3000', SCHEDULER_SECRET: 'short' }, 'SCHEDULER_SECRET must contain at least 16 characters'],
  ])('rejects invalid worker configuration %#', (environment, message) => {
    expect(() => localNotificationWorkerConfig(environment)).toThrow(message);
  });
});

it('runs immediately and waits 30 seconds between cycles', async () => {
  const abortController = new AbortController();
  const fetchImpl = vi.fn()
    .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      claimed: 0,
      sent: 0,
      failed: 0,
      recovered: 0,
    }), { status: 200 }));
  const onResult = vi.fn();
  const wait = vi.fn(async (milliseconds: number) => {
    expect(milliseconds).toBe(LOCAL_NOTIFICATION_POLL_INTERVAL_MILLISECONDS);
    abortController.abort();
  });

  await runLocalNotificationWorker({
    appUrl: 'http://localhost:3000',
    schedulerSecret: 'scheduler-secret-123456',
    signal: abortController.signal,
    fetchImpl,
    wait,
    onResult,
  });

  expect(onResult).toHaveBeenCalledWith({
    kind: 'processed',
    status: 200,
    counts: { claimed: 0, sent: 0, failed: 0, recovered: 0 },
  });
  expect(wait).toHaveBeenCalledOnce();
});

it('continues polling after a rejected processor cycle', async () => {
  const abortController = new AbortController();
  const fetchImpl = vi.fn()
    .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    .mockResolvedValueOnce(new Response('{}', { status: 401 }))
    .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      claimed: 0,
      sent: 0,
      failed: 0,
      recovered: 0,
    }), { status: 200 }));
  const onResult = vi.fn();
  let waits = 0;
  const wait = vi.fn(async () => {
    waits += 1;
    if (waits === 2) abortController.abort();
  });

  await runLocalNotificationWorker({
    appUrl: 'http://localhost:3000',
    schedulerSecret: 'scheduler-secret-123456',
    signal: abortController.signal,
    fetchImpl,
    wait,
    onResult,
  });

  expect(onResult.mock.calls.map(([result]) => result.kind)).toEqual(['rejected', 'processed']);
});
