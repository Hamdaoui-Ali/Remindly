import type { EmailAttemptOutcome, EmailPurpose, Prisma } from '@/generated/prisma/client';
import {
  EMAIL_BUDGET_WINDOW_MILLISECONDS,
  GMAIL_BUDGET_ADVISORY_LOCK_KEY,
  evaluateEmailBudget,
  type EmailBudgetPolicy,
} from './budget';

export interface EmailBudgetRepository {
  count(args: { where: {
    attemptedAt: { gte: Date };
    outcome: { in: EmailAttemptOutcome[] };
    purpose?: EmailPurpose;
  }}): Promise<number>;
  create(args: { data: {
    purpose: EmailPurpose;
    outcome: 'RESERVED';
    attemptedAt: Date;
    notificationId?: string;
  }}): Promise<{ id: string }>;
  update(args: { where: { id: string }; data: {
    outcome: EmailAttemptOutcome;
    sanitizedCode?: string;
    providerMessageId?: string | null;
    completedAt: Date;
  }}): Promise<unknown>;
  updateMany(args: { where: {
    outcome: 'RESERVED';
    attemptedAt: { lt: Date };
  }; data: {
    outcome: 'UNKNOWN_OUTCOME';
    sanitizedCode: string;
    completedAt: Date;
  }}): Promise<{ count: number }>;
}

export type BudgetTransaction = Pick<Prisma.TransactionClient, '$executeRaw'> & {
  emailSendAttempt: EmailBudgetRepository;
};

export async function reserveEmailSend(
  tx: BudgetTransaction,
  policy: EmailBudgetPolicy,
  purpose: 'REMINDER' | 'AUTH',
  now: Date,
  notificationId?: string,
): Promise<{ id: string } | null> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${GMAIL_BUDGET_ADVISORY_LOCK_KEY})`;
  const since = new Date(now.getTime() - EMAIL_BUDGET_WINDOW_MILLISECONDS);
  const outcomes: EmailAttemptOutcome[] = ['RESERVED', 'ACCEPTED', 'UNKNOWN_OUTCOME'];
  const base = { attemptedAt: { gte: since }, outcome: { in: outcomes } } as const;
  const total = await tx.emailSendAttempt.count({ where: base });
  const reminder = await tx.emailSendAttempt.count({ where: { ...base, purpose: 'REMINDER' } });
  const auth = await tx.emailSendAttempt.count({ where: { ...base, purpose: 'AUTH' } });
  const decision = evaluateEmailBudget(policy, { total, reminder, auth }, purpose, 1);
  if (!decision.allowed) return null;
  return tx.emailSendAttempt.create({ data: { purpose, outcome: 'RESERVED', attemptedAt: now, notificationId } });
}

export function finalizeEmailSend(
  repository: Pick<EmailBudgetRepository, 'update'>,
  id: string,
  outcome: EmailAttemptOutcome,
  now: Date,
  details: { sanitizedCode?: string; providerMessageId?: string | null } = {},
): Promise<unknown> {
  return repository.update({ where: { id }, data: { outcome, completedAt: now, ...details } });
}

export function recoverStaleEmailReservations(
  repository: Pick<EmailBudgetRepository, 'updateMany'>,
  before: Date,
  now: Date,
): Promise<{ count: number }> {
  return repository.updateMany({
    where: { outcome: 'RESERVED', attemptedAt: { lt: before } },
    data: {
      outcome: 'UNKNOWN_OUTCOME',
      sanitizedCode: 'gmail_stale_reservation',
      completedAt: now,
    },
  });
}
