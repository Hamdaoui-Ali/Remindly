export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
}

export interface SendEmailResult {
  providerMessageId?: string;
}

export type EmailDeliveryOutcome = 'definite_failure' | 'unknown_outcome';

/**
 * Provider-neutral, sanitized delivery failure. An unknown outcome may mean
 * the provider accepted the request before the connection failed. Retries
 * always reuse the notification UUID; providers without idempotency can still
 * produce a duplicate after an unknown outcome.
 */
export class EmailDeliveryError extends Error {
  constructor(readonly outcome: EmailDeliveryOutcome) {
    super(outcome === 'definite_failure'
      ? 'Email provider definite failure'
      : 'Email provider outcome unknown');
    this.name = 'EmailDeliveryError';
  }
}

export function emailDeliveryOutcome(error: unknown): EmailDeliveryOutcome | null {
  if (!error || typeof error !== 'object' || !('outcome' in error)) return null;
  const outcome = error.outcome;
  return outcome === 'definite_failure' || outcome === 'unknown_outcome' ? outcome : null;
}

export interface EmailProvider {
  /** Rejects with EmailDeliveryError when delivery is not accepted definitely. */
  send(input: SendEmailInput): Promise<SendEmailResult>;
}
