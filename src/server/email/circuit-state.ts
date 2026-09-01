import type { GmailCircuitState, Prisma, PrismaClient } from '@/generated/prisma/client';

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
