import { EmailDeliveryError } from './provider';

export type GmailFailureKind =
  | 'permanent'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'auth_revoked'
  | 'unknown_outcome';

export class GmailDeliveryError extends EmailDeliveryError {
  constructor(
    readonly kind: GmailFailureKind,
    readonly code: string,
    outcome: 'definite_failure' | 'unknown_outcome',
  ) {
    super(outcome);
    this.name = 'GmailDeliveryError';
  }
}

export function classifyGmailResponse(status: number, body?: unknown): GmailDeliveryError {
  if (status === 401) return new GmailDeliveryError('auth_revoked', 'gmail_auth_revoked', 'definite_failure');
  if (status === 403) {
    const details = JSON.stringify(body ?? '');
    if (/rateLimit|quota|dailyLimit/i.test(details)) {
      return new GmailDeliveryError('rate_limited', 'gmail_rate_limited', 'definite_failure');
    }
    return new GmailDeliveryError('permanent', 'gmail_forbidden', 'definite_failure');
  }
  if (status === 429) return new GmailDeliveryError('rate_limited', 'gmail_429', 'definite_failure');
  if (status >= 500) return new GmailDeliveryError('provider_unavailable', 'gmail_5xx', 'unknown_outcome');
  return new GmailDeliveryError('permanent', 'gmail_invalid_message', 'definite_failure');
}

export function gmailTransportError(): GmailDeliveryError {
  return new GmailDeliveryError('unknown_outcome', 'gmail_unknown_transport', 'unknown_outcome');
}
