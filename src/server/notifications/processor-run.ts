import type { Prisma, PrismaClient, ProcessorRun } from '@/generated/prisma/client';

export type ProcessorRunDatabase = PrismaClient | Prisma.TransactionClient;
export interface ProcessorCounts {
  claimed: number;
  sent: number;
  failed: number;
  recovered: number;
}

export function startProcessorRun(db: ProcessorRunDatabase, startedAt: Date): Promise<ProcessorRun> {
  return db.processorRun.create({ data: { status: 'RUNNING', startedAt } });
}

export function completeProcessorRun(
  db: ProcessorRunDatabase,
  id: string,
  status: 'SUCCEEDED' | 'FAILED',
  counts: ProcessorCounts,
  completedAt: Date,
  sanitizedFailureCode: string | null = null,
): Promise<ProcessorRun> {
  return db.processorRun.update({
    where: { id },
    data: { ...counts, status, completedAt, sanitizedFailureCode },
  });
}
