export const EMAIL_BUDGET_WINDOW_MILLISECONDS = 24 * 60 * 60 * 1_000;
export const DEFAULT_EMAIL_BUDGET = 350;
export const DEFAULT_AUTH_RESERVE = 50;
export const DEFAULT_REMINDER_CLAIM_CEILING = 300;
export const GMAIL_BUDGET_ADVISORY_LOCK_KEY = 7_241_913_501;

export interface EmailBudgetPolicy {
  total: number;
  authReserve: number;
  reminderCeiling: number;
}

export interface EmailBudgetUsage {
  total: number;
  reminder: number;
  auth: number;
}

export interface EmailBudgetDecision {
  allowed: boolean;
  claimLimit: number;
  totalRemaining: number;
  purposeRemaining: number;
}

export function evaluateEmailBudget(
  policy: EmailBudgetPolicy,
  usage: EmailBudgetUsage,
  purpose: 'REMINDER' | 'AUTH',
  requested: number,
): EmailBudgetDecision {
  const totalRemaining = Math.max(0, policy.total - usage.total);
  const purposeLimit = purpose === 'REMINDER'
    ? policy.reminderCeiling
    : policy.total;
  const purposeUsed = purpose === 'REMINDER' ? usage.reminder : usage.auth;
  const purposeRemaining = Math.max(0, purposeLimit - purposeUsed);
  const unspentAuthReserve = purpose === 'REMINDER'
    ? Math.max(0, policy.authReserve - usage.auth)
    : 0;
  const available = Math.max(0, totalRemaining - unspentAuthReserve);
  const claimLimit = Math.min(Math.max(0, Math.trunc(requested)), purposeRemaining, available);

  return {
    allowed: claimLimit > 0,
    claimLimit,
    totalRemaining,
    purposeRemaining,
  };
}
