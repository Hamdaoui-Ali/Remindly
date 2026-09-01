import { describe, expect, it } from 'vitest';
import {
  buildNotificationTransitionData,
  NotificationRepository,
  type NotificationDatabase,
} from '@/server/notifications/repository';

interface NotificationState {
  id: string;
  status: 'PROCESSING' | 'SENT' | 'FAILED';
  attemptCount: number;
  processingStartedAt: Date | null;
  nextAttemptAt: Date | null;
  lastError: string | null;
}

function fakeDatabase(states: NotificationState[]): NotificationDatabase {
  return {
    notification: {
      async updateMany(input: {
        where: {
          id?: string;
          status?: string;
          attemptCount?: { gte: number };
          processingStartedAt?: Date | { lt: Date };
        };
        data: Partial<NotificationState>;
      }) {
        let count = 0;
        for (const state of states) {
          const expectedLease = input.where.processingStartedAt;
          const leaseMatches = expectedLease instanceof Date
            ? state.processingStartedAt?.getTime() === expectedLease.getTime()
            : !expectedLease || (
              state.processingStartedAt !== null
              && state.processingStartedAt < expectedLease.lt
            );
          const matches = (!input.where.id || state.id === input.where.id)
            && (!input.where.status || state.status === input.where.status)
            && (!input.where.attemptCount || state.attemptCount >= input.where.attemptCount.gte)
            && leaseMatches;
          if (!matches) continue;
          Object.assign(state, input.data);
          count += 1;
        }
        return { count };
      },
    },
  } as unknown as NotificationDatabase;
}

describe('NotificationRepository processing leases', () => {
  it('builds a shared transition payload with an optional attempt increment', () => {
    expect(buildNotificationTransitionData({
      status: 'PROCESSING',
      processingStartedAt: new Date('2026-08-19T11:00:00.000Z'),
      providerMessageId: undefined,
      sentAt: undefined,
      nextAttemptAt: null,
      lastError: null,
      incrementAttemptCount: true,
    })).toMatchObject({
      status: 'PROCESSING',
      processingStartedAt: new Date('2026-08-19T11:00:00.000Z'),
      nextAttemptAt: null,
      lastError: null,
      attemptCount: { increment: 1 },
    });
  });

  it('rejects a stale completion and leaves the newer claimant authoritative', async () => {
    const staleLease = new Date('2026-08-19T11:00:00.000Z');
    const currentLease = new Date('2026-08-19T12:00:00.000Z');
    const state: NotificationState = {
      id: '1e4785b7-7a88-46f0-8b61-bb76dd356bd7',
      status: 'PROCESSING',
      attemptCount: 2,
      processingStartedAt: currentLease,
      nextAttemptAt: null,
      lastError: null,
    };
    const repository = new NotificationRepository(fakeDatabase([state]));
    const transition = {
      status: 'SENT' as const,
      processingStartedAt: null,
      expectedProcessingStartedAt: staleLease,
    };

    const transitioned = await repository.markSent(state.id, transition);

    expect(transitioned).toBe(false);
    expect(state).toMatchObject({
      status: 'PROCESSING',
      processingStartedAt: currentLease,
    });
  });

  it('terminalizes only expired processing rows already at the fifth attempt', async () => {
    const expiredAt = new Date('2026-08-19T11:00:00.000Z');
    const states: NotificationState[] = [4, 5].map((attemptCount) => ({
      id: `00000000-0000-4000-8000-00000000000${attemptCount}`,
      status: 'PROCESSING',
      attemptCount,
      processingStartedAt: expiredAt,
      nextAttemptAt: null,
      lastError: null,
    }));
    const repository = new NotificationRepository(fakeDatabase(states));
    const transition = {
      leaseExpiredBefore: new Date('2026-08-19T11:45:00.000Z'),
      expectedStatus: 'PROCESSING' as const,
      status: 'FAILED' as const,
      processingStartedAt: null,
      incrementAttemptCount: false,
      minimumAttemptCount: 5,
      nextAttemptAt: null,
      lastError: 'Processing lease expired after final attempt',
    };

    const count = await repository.reclaimExpiredProcessing(transition);

    expect(count).toBe(1);
    expect(states[0]).toMatchObject({ status: 'PROCESSING', attemptCount: 4 });
    expect(states[1]).toMatchObject({
      status: 'FAILED',
      attemptCount: 5,
      processingStartedAt: null,
      nextAttemptAt: null,
      lastError: 'Processing lease expired after final attempt',
    });
  });
});
