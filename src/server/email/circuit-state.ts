import type { GmailCircuitState, Prisma, PrismaClient } from '@/generated/prisma/client';
import { initialCircuitBreakerState, recordCircuitFailure } from '@/server/notifications/circuit-breaker';

export const GMAIL_CIRCUIT_SINGLETON_ID = 'singleton';
export type CircuitStateDatabase = PrismaClient | Prisma.TransactionClient;

export function readGmailCircuitState(db: CircuitStateDatabase): Promise<GmailCircuitState> {
  return db.gmailCircuitState.upsert({
    where: { id: GMAIL_CIRCUIT_SINGLETON_ID },
    update: {},
    create: { id: GMAIL_CIRCUIT_SINGLETON_ID },
  });
}

export function closeGmailCircuit(db: CircuitStateDatabase): Promise<GmailCircuitState> {
  return db.gmailCircuitState.update({
    where: { id: GMAIL_CIRCUIT_SINGLETON_ID },
    data: { state: 'CLOSED', failureCount: 0, openedAt: null, lastFailureCode: null },
  });
}

export function openGmailCircuit(
  db: CircuitStateDatabase,
  failureCount: number,
  code: string,
  openedAt: Date,
): Promise<GmailCircuitState> {
  return db.gmailCircuitState.update({
    where: { id: GMAIL_CIRCUIT_SINGLETON_ID },
    data: { state: 'OPEN', failureCount, openedAt, lastFailureCode: code },
  });
}

export async function recordGmailCircuitFailure(
  db: CircuitStateDatabase,
  code: string,
  now: Date,
  policy: { failureThreshold: number },
): Promise<GmailCircuitState> {
  const current = await readGmailCircuitState(db);
  const next = recordCircuitFailure({
    state: current.state.toLowerCase() as 'closed' | 'open' | 'half_open',
    failureCount: current.failureCount,
    openedAt: current.openedAt,
    lastFailureCode: current.lastFailureCode,
  }, code, now, { ...policy, openForMilliseconds: 60_000 });
  return db.gmailCircuitState.update({
    where: { id: GMAIL_CIRCUIT_SINGLETON_ID },
    data: {
      state: next.state.toUpperCase() as 'CLOSED' | 'OPEN' | 'HALF_OPEN',
      failureCount: next.failureCount,
      openedAt: next.openedAt,
      lastFailureCode: next.lastFailureCode,
    },
  });
}
