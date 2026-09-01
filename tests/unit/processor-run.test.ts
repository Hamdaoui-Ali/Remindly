import { describe, expect, it } from 'vitest';
import { completeProcessorRun, startProcessorRun } from '@/server/notifications/processor-run';

describe('ProcessorRun repository', () => {
  it('creates a sanitized running heartbeat', async () => {
    const create = async (args: unknown) => ({ id: 'run-1', args });
    await expect(startProcessorRun({ processorRun: { create } } as never, new Date(1))).resolves.toMatchObject({ id: 'run-1' });
  });

  it('finalizes aggregate counts and sanitized failure state', async () => {
    const update = async (args: unknown) => args;
    await expect(completeProcessorRun({ processorRun: { update } } as never, 'run-1', 'FAILED', {
      claimed: 2, sent: 1, failed: 1, recovered: 0,
    }, new Date(2), 'gmail_auth_revoked')).resolves.toMatchObject({
      where: { id: 'run-1' },
      data: {
        status: 'FAILED', claimed: 2, sent: 1, failed: 1, recovered: 0,
        sanitizedFailureCode: 'gmail_auth_revoked', completedAt: new Date(2),
      },
    });
  });
});
