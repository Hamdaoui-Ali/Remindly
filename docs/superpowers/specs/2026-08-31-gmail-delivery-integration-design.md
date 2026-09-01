# Remindly Gmail Delivery Integration Design

## Goal

Route reminder and Supabase Auth email delivery through the existing Gmail
provider boundary while preserving Remindly's retry semantics, shared rolling
budget, circuit-breaker safety, and sanitized operational behavior.

This design covers application integration. Production Gmail credentials,
Supabase Hook registration, and Cron activation remain deployment steps.

## Boundaries

The shared delivery service is the only application path allowed to call an
email provider. It accepts a provider-neutral message plus a purpose
(`REMINDER` or `AUTH`), reserves capacity before the network request, checks
the circuit state, and finalizes the ledger row after the request.

The reminder processor continues to own notification claims, leases, retries,
and notification state. The delivery service does not claim notifications and
does not hold a database transaction during Gmail I/O. The Auth Hook owns its
request validation and five-second deadline; it delegates only delivery and
sanitized outcome handling.

## Delivery flow

1. The caller validates its input and builds the provider-neutral message.
2. A short transaction acquires the shared Gmail advisory lock, checks the
   rolling budget and circuit state, and inserts one `RESERVED` attempt.
3. The transaction commits before Gmail is called.
4. Gmail OAuth refresh and send occur outside the transaction with bounded
   timeouts.
5. The attempt is finalized with only a purpose, outcome, sanitized code,
   provider message ID when available, and timestamps.
6. A stale-reservation recovery job changes abandoned `RESERVED` rows to
   `UNKNOWN_OUTCOME`, preserving duplicate-send caution.

Reminder claims and their reservation must commit atomically. The processor
will calculate its claim limit from the budget decision before claiming. When
capacity is exhausted, it returns a successful zero-claim result with a
sanitized quota state.

## Provider selection and configuration

Production delivery uses `GmailEmailProvider` with `GmailOAuthClient`. The
current Resend provider remains available only for compatibility until the
Gmail cutover is explicitly enabled. Missing Gmail configuration is a
sanitized configuration failure and must not result in a provider call.

The shared service maps Gmail errors to the existing provider-neutral outcome
contract. Definite failures do not consume rolling capacity after a proven
pre-request failure; accepted and ambiguous outcomes do consume capacity.

## Auth Hook contract

The Auth Hook endpoint accepts only the Supabase Send Email Hook payload and a
valid signature according to the deployed Supabase contract. It rejects
malformed payloads with a stable 400 response and invalid signatures with 401.
It returns sanitized 429 responses for application budget limits and sanitized
503 responses for temporary provider failures. It never returns Google error
bodies, credentials, email addresses, subjects, or message bodies.

The total handler deadline is below five seconds, with shorter individual
OAuth and Gmail request timeouts. An ambiguous timeout is finalized as
`UNKNOWN_OUTCOME`; the Hook does not retry the same send inside the request.

## Circuit breaker and diagnostics

The circuit opens after the configured number of auth-revoked,
mailbox-daily-limit, or configuration failures. It blocks new Gmail calls,
then permits one half-open probe after the cooldown. A successful probe closes
the circuit. Generic transient 5xx and 429 errors remain retryable provider
failures and do not open this breaker by themselves.

Protected diagnostics expose only circuit state, failure count, timestamps,
and sanitized failure codes. They do not expose recipient data or secrets.

## Testing strategy

- Unit-test shared delivery routing and purpose propagation.
- Unit-test budget exhaustion, Auth reserve protection, reservation rollback,
  and stale recovery.
- Unit-test circuit open, half-open, recovery, and sanitized diagnostics.
- Test Auth Hook signature, payload validation, timeout, budget, and provider
  error responses.
- Test the reminder processor with a Gmail provider and verify notification
  state transitions remain unchanged.
- Run the existing full unit suite, typecheck, lint, and production build.

## Rollout and rollback

The code path is deployed behind an explicit Gmail delivery configuration
switch. The switch remains disabled until Gmail OAuth, the Auth Hook, budget
ledger, and operational diagnostics are verified in the deployed environment.
Rollback is the previous application deployment with the compatibility
provider still configured. Supabase Hook and Cron activation are separate
steps and are not enabled by a code deploy alone.
