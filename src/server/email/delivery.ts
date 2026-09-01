import {
  emailDeliveryOutcome,
  type EmailProvider,
  type SendEmailInput,
} from './provider';

export type EmailDeliveryResult =
  | { status: 'sent'; providerMessageId?: string }
  | { status: 'blocked'; reason: 'budget_exhausted' | 'circuit_open' };

export interface EmailDeliveryDependencies {
  provider: EmailProvider;
  reserve: (purpose: 'REMINDER' | 'AUTH', now: Date) => Promise<{ id: string } | null>;
  finalize: (
    id: string,
    outcome: 'ACCEPTED' | 'DEFINITE_FAILURE' | 'UNKNOWN_OUTCOME',
    now: Date,
    details?: { sanitizedCode?: string; providerMessageId?: string | null },
  ) => Promise<unknown>;
  circuit: {
    isOpen: () => boolean;
    success: () => void;
    failure: (code: string) => void;
  };
}

function sanitizedCode(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return fallback;
}

export function createEmailDelivery(dependencies: EmailDeliveryDependencies) {
  return {
    async send(
      purpose: 'REMINDER' | 'AUTH',
      message: SendEmailInput,
      now = new Date(),
    ): Promise<EmailDeliveryResult> {
      if (dependencies.circuit.isOpen()) return { status: 'blocked', reason: 'circuit_open' };
      const reservation = await dependencies.reserve(purpose, now);
      if (!reservation) return { status: 'blocked', reason: 'budget_exhausted' };

      try {
        const result = await dependencies.provider.send(message);
        await dependencies.finalize(reservation.id, 'ACCEPTED', new Date(), {
          sanitizedCode: 'email_accepted',
          providerMessageId: result.providerMessageId ?? null,
        });
        dependencies.circuit.success();
        return { status: 'sent', providerMessageId: result.providerMessageId };
      } catch (error) {
        const outcome = emailDeliveryOutcome(error) ?? 'unknown_outcome';
        const ledgerOutcome = outcome === 'definite_failure' ? 'DEFINITE_FAILURE' : 'UNKNOWN_OUTCOME';
        const code = sanitizedCode(error, `email_provider_${outcome}`);
        await dependencies.finalize(reservation.id, ledgerOutcome, new Date(), { sanitizedCode: code });
        dependencies.circuit.failure(code);
        throw error;
      }
    },
  };
}
