import { serverEnv } from '@/lib/env';
import { prisma } from '@/server/db/client';
import { reserveEmailSend, finalizeEmailSend } from '@/server/notifications/budget-repository';
import { DEFAULT_REMINDER_CLAIM_CEILING } from '@/server/notifications/budget';
import { advanceCircuitBreaker } from '@/server/notifications/circuit-breaker';
import { closeGmailCircuit, readGmailCircuitState, recordGmailCircuitFailure } from './circuit-state';
import { GmailEmailProvider } from './gmail-provider';
import { GmailOAuthClient } from './gmail-oauth';
import { ResendEmailProvider } from './resend-provider';
import { createEmailDelivery, type EmailDeliveryDependencies } from './delivery';

export function createConfiguredEmailDelivery() {
  const env = serverEnv();
  const provider = env.EMAIL_PROVIDER === 'gmail'
    ? new GmailEmailProvider({
      from: `${env.GMAIL_SENDER_NAME} <${env.GMAIL_SENDER_EMAIL}>`,
      oauth: new GmailOAuthClient({
        clientId: env.GMAIL_CLIENT_ID!,
        clientSecret: env.GMAIL_CLIENT_SECRET!,
        refreshToken: env.GMAIL_REFRESH_TOKEN!,
      }),
      requestTimeoutMs: env.GMAIL_REQUEST_TIMEOUT_MS,
    })
    : new ResendEmailProvider({ apiKey: env.RESEND_API_KEY, from: env.RESEND_FROM });
  const policy = {
    total: env.GMAIL_TOTAL_DAILY_BUDGET,
    authReserve: env.GMAIL_AUTH_RESERVE,
    reminderCeiling: Math.min(DEFAULT_REMINDER_CLAIM_CEILING, env.GMAIL_TOTAL_DAILY_BUDGET - env.GMAIL_AUTH_RESERVE),
  };
  const dependencies: EmailDeliveryDependencies = {
    provider,
    reserve: (purpose, now) => prisma.$transaction((tx) => reserveEmailSend(tx, policy, purpose, now)),
    finalize: (id, outcome, now, details) => finalizeEmailSend(prisma.emailSendAttempt, id, outcome, now, details),
    circuit: {
      isOpen: async () => {
        const current = await readGmailCircuitState(prisma);
        const state = {
          state: current.state.toLowerCase() as 'closed' | 'open' | 'half_open',
          failureCount: current.failureCount,
          openedAt: current.openedAt,
          lastFailureCode: current.lastFailureCode,
        };
        return !advanceCircuitBreaker(state, new Date(), { failureThreshold: 3, openForMilliseconds: 60_000 }).allowed;
      },
      success: async () => { await closeGmailCircuit(prisma); },
      failure: async (code) => { await recordGmailCircuitFailure(prisma, code, new Date(), { failureThreshold: 3 }); },
    },
  };
  return createEmailDelivery(dependencies);
}
