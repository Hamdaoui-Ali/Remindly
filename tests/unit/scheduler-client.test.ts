import { describe, expect, it, vi } from 'vitest';
import {
  formatSchedulerCycleResult,
  runSchedulerCycle,
} from '@/server/notifications/scheduler-client';

const input = {
  appUrl: 'http://localhost:3000',
  schedulerSecret: 'scheduler-secret-123456',
};

describe('scheduler client', () => {
  it('checks health before processing and returns aggregate counts', async () => {
    const abortController = new AbortController();
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'ok', database: 'ok' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ claimed: 1, sent: 1, failed: 0, recovered: 0 }), { status: 200 }));

    await expect(runSchedulerCycle({ ...input, signal: abortController.signal, fetchImpl })).resolves.toEqual({
      kind: 'processed',
      status: 200,
      counts: { claimed: 1, sent: 1, failed: 0, recovered: 0 },
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(1, 'http://localhost:3000/api/health', expect.objectContaining({
      method: 'GET',
      signal: abortController.signal,
    }));
    expect(fetchImpl).toHaveBeenNthCalledWith(2, 'http://localhost:3000/api/internal/process-due-notifications', expect.objectContaining({
      method: 'POST',
      headers: { 'x-scheduler-secret': input.schedulerSecret },
      redirect: 'error',
      signal: abortController.signal,
    }));
  });

  it('cancels an active health fetch and never begins processor processing', async () => {
    const abortController = new AbortController();
    const fetchImpl = vi.fn(() => new Promise<Response>((_resolve, reject) => {
      abortController.signal.addEventListener('abort', () => {
        reject(new DOMException('aborted', 'AbortError'));
      }, { once: true });
    }));

    const cycle = runSchedulerCycle({ ...input, signal: abortController.signal, fetchImpl });
    abortController.abort();

    await expect(cycle).resolves.toEqual({ kind: 'unavailable' });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:3000/api/health', expect.objectContaining({
      signal: abortController.signal,
    }));
  });

  it('does not begin processor processing after health completes into cancellation', async () => {
    const abortController = new AbortController();
    const fetchImpl = vi.fn(() => {
      abortController.abort();
      return Promise.resolve(new Response('{}', { status: 200 }));
    });

    await expect(runSchedulerCycle({ ...input, signal: abortController.signal, fetchImpl })).resolves.toEqual({
      kind: 'unavailable',
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('does not process while health is unavailable', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    await expect(runSchedulerCycle({ ...input, fetchImpl })).resolves.toEqual({ kind: 'not-ready', status: 503 });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('returns a sanitized rejection without parsing the provider body', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response('secret provider details', { status: 401 }));
    const result = await runSchedulerCycle({ ...input, fetchImpl });
    expect(result).toEqual({ kind: 'rejected', status: 401 });
    expect(formatSchedulerCycleResult(result)).toBe('processor rejected status=401');
    expect(formatSchedulerCycleResult(result)).not.toContain('secret');
  });

  it('handles network and malformed-response failures without throwing', async () => {
    const unavailable = vi.fn().mockRejectedValue(new Error('connection includes private data'));
    await expect(runSchedulerCycle({ ...input, fetchImpl: unavailable })).resolves.toEqual({ kind: 'unavailable' });

    const malformed = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    await expect(runSchedulerCycle({ ...input, fetchImpl: malformed })).resolves.toEqual({ kind: 'invalid-response', status: 200 });
  });
});
