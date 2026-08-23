import { afterEach, describe, expect, it, vi } from 'vitest';
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
    [{ APP_URL: 'ftp://localhost:3000', SCHEDULER_SECRET: 'scheduler-secret-123456' }, 'APP_URL must use HTTP or HTTPS'],
    [{ APP_URL: 'http://localhost:3000', SCHEDULER_SECRET: 'short' }, 'SCHEDULER_SECRET must contain at least 16 characters'],
  ])('rejects invalid worker configuration %#', (environment, message) => {
    expect(() => localNotificationWorkerConfig(environment)).toThrow(message);
  });
});

afterEach(() => {
  vi.useRealTimers();
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

it('does not fetch for an already-aborted worker input', async () => {
  const abortController = new AbortController();
  const fetchImpl = vi.fn();
  const onResult = vi.fn();
  abortController.abort();

  await runLocalNotificationWorker({
    appUrl: 'http://localhost:3000',
    schedulerSecret: 'scheduler-secret-123456',
    signal: abortController.signal,
    fetchImpl,
    onResult,
  });

  expect(fetchImpl).not.toHaveBeenCalled();
  expect(onResult).not.toHaveBeenCalled();
});

it('cancels the default wait and removes its abort listener', async () => {
  const abortController = new AbortController();
  const addEventListener = vi.spyOn(abortController.signal, 'addEventListener');
  const removeEventListener = vi.spyOn(abortController.signal, 'removeEventListener');
  const fetchImpl = vi.fn((input: string | URL | Request) => Promise.resolve(
    String(input).endsWith('/api/health')
      ? new Response('{}', { status: 200 })
      : new Response(JSON.stringify({ claimed: 0, sent: 0, failed: 0, recovered: 0 }), { status: 200 }),
  ));

  await runLocalNotificationWorker({
    appUrl: 'http://localhost:3000',
    schedulerSecret: 'scheduler-secret-123456',
    signal: abortController.signal,
    fetchImpl,
    onResult: () => queueMicrotask(() => abortController.abort()),
  });

  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect(addEventListener).toHaveBeenCalledOnce();
  expect(removeEventListener).toHaveBeenCalledWith('abort', expect.any(Function));
});

it('removes default wait listeners after normal timer resolution without accumulation', async () => {
  vi.useFakeTimers();
  const abortController = new AbortController();
  const addEventListener = vi.spyOn(abortController.signal, 'addEventListener');
  const removeEventListener = vi.spyOn(abortController.signal, 'removeEventListener');
  const fetchImpl = vi.fn((input: string | URL | Request) => Promise.resolve(
    String(input).endsWith('/api/health')
      ? new Response('{}', { status: 200 })
      : new Response(JSON.stringify({ claimed: 0, sent: 0, failed: 0, recovered: 0 }), { status: 200 }),
  ));
  let results = 0;
  let removalsBeforeAbort = -1;

  const worker = runLocalNotificationWorker({
    appUrl: 'http://localhost:3000',
    schedulerSecret: 'scheduler-secret-123456',
    signal: abortController.signal,
    fetchImpl,
    onResult: () => {
      results += 1;
      if (results === 3) {
        removalsBeforeAbort = removeEventListener.mock.calls.length;
        abortController.abort();
      }
    },
  });

  await vi.advanceTimersByTimeAsync(LOCAL_NOTIFICATION_POLL_INTERVAL_MILLISECONDS * 2);
  await worker;

  expect(addEventListener).toHaveBeenCalledTimes(2);
  expect(removalsBeforeAbort).toBe(2);
  expect(removeEventListener).toHaveBeenCalledTimes(2);
});
