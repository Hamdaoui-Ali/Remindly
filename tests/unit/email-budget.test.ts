import { describe, expect, it } from 'vitest';
import {
  evaluateEmailBudget,
  type EmailBudgetUsage,
} from '@/server/notifications/budget';
import { finalizeEmailSend, recoverStaleEmailReservations, reserveEmailSend } from '@/server/notifications/budget-repository';
import {
  advanceCircuitBreaker,
  initialCircuitBreakerState,
  recordCircuitFailure,
  type CircuitBreakerPolicy,
} from '@/server/notifications/circuit-breaker';

const policy = { total: 350, authReserve: 50, reminderCeiling: 300 };

describe('evaluateEmailBudget', () => {
  it('allows reminders below both the total and reminder ceilings', () => {
    const usage: EmailBudgetUsage = { total: 10, reminder: 8, auth: 2 };

    expect(evaluateEmailBudget(policy, usage, 'REMINDER', 5)).toEqual({
      allowed: true,
      claimLimit: 5,
      totalRemaining: 340,
      purposeRemaining: 292,
    });
  });

  it('preserves the Auth reserve for reminder claims', () => {
    const usage: EmailBudgetUsage = { total: 305, reminder: 295, auth: 10 };

    expect(evaluateEmailBudget(policy, usage, 'REMINDER', 20)).toMatchObject({
      allowed: true,
      claimLimit: 5,
      totalRemaining: 45,
      purposeRemaining: 5,
    });
  });

  it('lets Auth use the reserve while total capacity remains', () => {
    const usage: EmailBudgetUsage = { total: 305, reminder: 295, auth: 10 };

    expect(evaluateEmailBudget(policy, usage, 'AUTH', 20)).toMatchObject({
      allowed: true,
      claimLimit: 20,
      totalRemaining: 45,
    });
  });

  it('fails closed when the rolling total is exhausted', () => {
    const usage: EmailBudgetUsage = { total: 350, reminder: 300, auth: 50 };

    expect(evaluateEmailBudget(policy, usage, 'AUTH', 1)).toMatchObject({
      allowed: false,
      claimLimit: 0,
      totalRemaining: 0,
    });
  });
});

describe('Gmail circuit breaker', () => {
  const breakerPolicy: CircuitBreakerPolicy = {
    failureThreshold: 2,
    openForMilliseconds: 60_000,
  };

  it('opens after repeated qualifying failures and blocks calls', () => {
    let state = initialCircuitBreakerState();
    state = recordCircuitFailure(state, 'gmail_auth_revoked', new Date(1), breakerPolicy);
    expect(state.state).toBe('closed');
    state = recordCircuitFailure(state, 'gmail_config_missing', new Date(2), breakerPolicy);

    expect(state).toMatchObject({ state: 'open', failureCount: 2 });
    expect(advanceCircuitBreaker(state, new Date(3), breakerPolicy).allowed).toBe(false);
  });

  it('moves to half-open after the cooldown and closes on success', () => {
    const opened = recordCircuitFailure(
      recordCircuitFailure(initialCircuitBreakerState(), 'gmail_auth_revoked', new Date(1), breakerPolicy),
      'gmail_config_missing',
      new Date(2),
      breakerPolicy,
    );
    const halfOpen = advanceCircuitBreaker(opened, new Date(60_002), breakerPolicy);

    expect(halfOpen).toMatchObject({ state: 'half_open', allowed: true });
    expect(advanceCircuitBreaker(halfOpen, new Date(60_003), breakerPolicy, true)).toMatchObject({
      state: 'closed',
      failureCount: 0,
      allowed: true,
    });
  });

  it('ignores non-breaker failures', () => {
    const state = recordCircuitFailure(
      initialCircuitBreakerState(),
      'gmail_invalid_message',
      new Date(),
      breakerPolicy,
    );

    expect(state).toEqual(initialCircuitBreakerState());
  });
});

describe('durable email budget adapter', () => {
  it('serializes the count and reservation under the shared database lock', async () => {
    const calls: string[] = [];
    const tx = {
      $executeRaw: async () => { calls.push('lock'); return 1; },
      emailSendAttempt: {
        count: async ({ where }: { where: { purpose?: string } }) => {
          calls.push(`count:${where.purpose ?? 'total'}`);
          return where.purpose === 'REMINDER' ? 2 : where.purpose === 'AUTH' ? 1 : 3;
        },
        create: async () => { calls.push('create'); return { id: 'attempt-1' }; },
        update: async () => undefined,
      },
    } as never;

    await expect(reserveEmailSend(tx, policy, 'REMINDER', new Date())).resolves.toEqual({ id: 'attempt-1' });
    expect(calls).toEqual(['lock', 'count:total', 'count:REMINDER', 'count:AUTH', 'create']);
  });

  it('does not create a reservation after the total budget is exhausted', async () => {
    let created = false;
    const tx = {
      $executeRaw: async () => 1,
      emailSendAttempt: {
        count: async () => 350,
        create: async () => { created = true; return { id: 'unexpected' }; },
        update: async () => undefined,
      },
    } as never;

    await expect(reserveEmailSend(tx, policy, 'AUTH', new Date())).resolves.toBeNull();
    expect(created).toBe(false);
  });

  it('finalizes with only sanitized delivery metadata', async () => {
    const update = async (args: unknown) => args;
    await expect(finalizeEmailSend({ update }, 'attempt-1', 'ACCEPTED', new Date(10), {
      sanitizedCode: 'gmail_accepted',
      providerMessageId: 'gmail-id-1',
    })).resolves.toMatchObject({
      where: { id: 'attempt-1' },
      data: { outcome: 'ACCEPTED', sanitizedCode: 'gmail_accepted', providerMessageId: 'gmail-id-1' },
    });
  });

  it('recovers stale reservations as unknown outcomes', async () => {
    const updateMany = async (args: unknown) => ({ count: args ? 3 : 0 });

    await expect(recoverStaleEmailReservations({ updateMany }, new Date(1), new Date(2))).resolves.toEqual({ count: 3 });
  });
});
