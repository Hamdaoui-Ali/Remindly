# Gmail Delivery Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route reminder and Supabase Auth email sends through Gmail with atomic budget reservations, circuit protection, sanitized outcomes, and a tested Auth Hook endpoint.

**Architecture:** A shared delivery service coordinates circuit checks, budget reservations, provider I/O, and ledger finalization. The reminder processor remains responsible for notification claims and retry state; the Auth Hook remains responsible for webhook validation and its five-second deadline. Gmail is selected by an explicit configuration switch, while Resend remains available for rollback compatibility.

**Tech Stack:** Next.js 16 App Router, TypeScript, Prisma 7, PostgreSQL/Supabase, Gmail OAuth/Gmail API, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-31-gmail-delivery-integration-design.md` and `docs/REMINDLY_GMAIL_SUPABASE_VERCEL_REFACTOR_SPEC.md`

## Global Constraints

- The shared rolling budget is 350 total Gmail sends per rolling 24-hour window, with `AUTH_RESERVE = 50` and `REMINDER_CLAIM_CEILING = 300`.
- Budget check and reservation must be atomic across reminder workers and Auth Hook requests.
- Never hold a database transaction or advisory lock while making a network request.
- `UNKNOWN_OUTCOME` attempts consume budget because Gmail may have accepted them.
- Supabase HTTP Auth Hooks must complete within five seconds.
- Do not log recipient addresses, Auth tokens, subjects, bodies, provider payloads, credentials, or provider response bodies.
- The Next.js 16 request interception file is `proxy.ts`; it is not an authorization substitute for route-level checks.
- Gmail configuration failures, revoked authorization, and mailbox daily-limit failures open the circuit; generic 5xx and 429 failures remain retryable without opening it.

---

### Task 1: Define shared delivery service and configuration

**Files:**
- Create: `src/server/email/delivery.ts`
- Modify: `src/lib/env.ts`
- Modify: `.env.example`
- Test: `tests/unit/email-delivery.test.ts`

**Interfaces:**
- Consumes: `EmailProvider`, `GmailEmailProvider`, `EmailPurpose`, `reserveEmailSend`, `finalizeEmailSend`, and circuit policy functions.
- Produces: `createEmailDelivery(options): EmailDeliveryService` and `EmailDeliveryService.send(purpose, message): Promise<EmailDeliveryResult>`.

- [ ] **Step 1: Write failing tests**

Test `send` with a fake provider and fake transaction factory. Assert that it reserves before provider I/O, finalizes `ACCEPTED` with the provider ID, finalizes `DEFINITE_FAILURE` for a known pre-request failure, finalizes `UNKNOWN_OUTCOME` for an ambiguous failure, and skips provider I/O when the budget or circuit blocks delivery.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npx.cmd vitest run --config vitest.unit.config.ts tests/unit/email-delivery.test.ts --maxWorkers=1 --pool=forks --no-file-parallelism`

Expected: FAIL because `src/server/email/delivery.ts` does not exist.

- [ ] **Step 3: Implement the service**

Use this result shape:

```ts
export type EmailDeliveryResult =
  | { status: 'sent'; providerMessageId?: string }
  | { status: 'blocked'; reason: 'budget_exhausted' | 'circuit_open' };
```

Construct Gmail from validated configuration only when `EMAIL_PROVIDER=gmail`; retain a Resend factory for `EMAIL_PROVIDER=resend`. Keep reservation and finalization calls injectable so tests never require PostgreSQL.

- [ ] **Step 4: Add configuration parsing and run tests**

Add `EMAIL_PROVIDER`, Gmail OAuth fields, sender fields, budget values, and timeout values to the server environment schema with Gmail-specific validation when Gmail is selected. Run the focused test command and expect all tests to pass.

- [ ] **Step 5: Commit**

```powershell
git add src/server/email/delivery.ts src/lib/env.ts .env.example tests/unit/email-delivery.test.ts
git commit -m "feat: add shared Gmail delivery service"
```

### Task 2: Wire budget-aware Gmail delivery into the reminder processor

**Files:**
- Modify: `src/server/notifications/processor.ts`
- Modify: `src/server/notifications/repository.ts`
- Modify: `src/app/api/internal/process-due-notifications/route.ts`
- Test: `tests/unit/notification-processor.test.ts`

**Interfaces:**
- Consumes: `EmailDeliveryService.send('REMINDER', message)` and the existing notification claim transitions.
- Produces: unchanged `ProcessDueNotificationsResult` plus zero claims when the reminder budget is exhausted.

- [ ] **Step 1: Write failing processor tests**

Add tests proving that the processor does not claim when the delivery service reports `budget_exhausted`, claims and sends through Gmail when capacity exists, preserves notification `SENT`/`FAILED` transitions, and does not log message content.

- [ ] **Step 2: Run the focused processor tests and verify failure**

Run: `npx.cmd vitest run --config vitest.unit.config.ts tests/unit/notification-processor.test.ts --maxWorkers=1 --pool=forks --no-file-parallelism`

Expected: FAIL because the processor currently accepts a provider directly and the route constructs `ResendEmailProvider`.

- [ ] **Step 3: Change the processor seam**

Replace the direct provider dependency with the minimal delivery interface:

```ts
export interface EmailDelivery {
  send(purpose: 'REMINDER' | 'AUTH', input: SendEmailInput): Promise<EmailDeliveryResult>;
}
```

The processor must calculate its claim limit before claiming, use the same transaction for reminder claim plus reservation, and return `{ claimed: 0, sent: 0, failed: 0, recovered }` when no capacity is available.

- [ ] **Step 4: Update the internal route and run tests**

Construct the configured shared delivery service in the route, keep the scheduler secret check unchanged, and run the focused processor tests plus existing scheduler route tests.

- [ ] **Step 5: Commit**

```powershell
git add src/server/notifications/processor.ts src/server/notifications/repository.ts src/app/api/internal/process-due-notifications/route.ts tests/unit/notification-processor.test.ts
git commit -m "feat: route reminder delivery through Gmail budget"
```

### Task 3: Add the Supabase Send Email Auth Hook

**Files:**
- Create: `src/app/api/auth/send-email/route.ts`
- Create: `src/server/auth/send-email-hook.ts`
- Modify: `src/server/email/delivery.ts`
- Test: `tests/unit/send-email-hook.test.ts`

**Interfaces:**
- Consumes: Supabase Hook request payload, configured signature secret, and `EmailDeliveryService.send('AUTH', message)`.
- Produces: sanitized HTTP responses: 400 malformed payload, 401 invalid signature, 429 budget/circuit block, 503 temporary provider failure, and 200 accepted delivery.

- [ ] **Step 1: Write failing endpoint tests**

Cover valid and invalid signatures, unsupported action, missing recipient, confirmation/recovery/invite action mapping, budget exhaustion, definite provider failure, ambiguous timeout, and the absence of sensitive values in response bodies.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npx.cmd vitest run --config vitest.unit.config.ts tests/unit/send-email-hook.test.ts --maxWorkers=1 --pool=forks --no-file-parallelism`

Expected: FAIL because the endpoint and payload adapter do not exist.

- [ ] **Step 3: Implement validation and signature verification**

Parse only the supported Supabase payload fields, verify the configured webhook signature using a constant-time comparison, and map each supported Auth action to a fixed subject/template. Never copy arbitrary subject/body values from the request into logs.

- [ ] **Step 4: Implement deadline-safe delivery**

Use an overall timeout below five seconds and shorter OAuth/Gmail request timeouts. Do not retry inside the Hook after an ambiguous outcome. Finalize the ledger attempt and return only the documented stable response shape.

- [ ] **Step 5: Run tests and commit**

Run the focused Hook tests and the complete unit suite, then commit:

```powershell
git add src/app/api/auth/send-email/route.ts src/server/auth/send-email-hook.ts src/server/email/delivery.ts tests/unit/send-email-hook.test.ts
git commit -m "feat: add Supabase Auth email hook"
```

### Task 4: Persist circuit health and expose protected diagnostics

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260831220000_add_gmail_circuit_state/migration.sql`
- Create: `src/server/email/circuit-state.ts`
- Create: `src/app/api/internal/email-health/route.ts`
- Test: `tests/unit/email-health.test.ts`
- Test: `tests/unit/gmail-circuit-state.test.ts`

**Interfaces:**
- Consumes: pure circuit-breaker transitions and scheduler secret authentication.
- Produces: a durable singleton circuit state and protected diagnostics containing only state, count, timestamps, and sanitized code.

- [ ] **Step 1: Write failing persistence and route tests**

Test open/half-open/closed persistence, concurrent-safe updates, unauthorized diagnostics, and sanitized authorized diagnostics.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npx.cmd vitest run --config vitest.unit.config.ts tests/unit/email-health.test.ts tests/unit/gmail-circuit-state.test.ts --maxWorkers=1 --pool=forks --no-file-parallelism`

Expected: FAIL because no durable circuit model or diagnostics route exists.

- [ ] **Step 3: Add the singleton model and migration**

Add one `GmailCircuitState` row keyed by a fixed singleton ID, with state, failure count, opened timestamp, last failure code, and updated timestamp. Add a guarded SQL migration that creates the table and singleton row without storing credentials or addresses.

- [ ] **Step 4: Implement guarded updates and diagnostics**

Update state inside short transactions, allow one half-open probe, and require `x-scheduler-secret` for diagnostics. Return a stable sanitized JSON shape.

- [ ] **Step 5: Run tests and commit**

Run focused tests, `npx.cmd prisma validate`, and typecheck, then commit:

```powershell
git add prisma/schema.prisma prisma/migrations src/server/email/circuit-state.ts src/app/api/internal/email-health/route.ts tests/unit/email-health.test.ts tests/unit/gmail-circuit-state.test.ts
git commit -m "feat: persist Gmail circuit health"
```

### Task 5: Final integration verification and rollout documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/REMINDLY_GMAIL_SUPABASE_VERCEL_REFACTOR_SPEC.md`
- Test: existing unit and app suites

- [ ] **Step 1: Document enablement and rollback**

Document the Gmail switch, required OAuth values, Auth Hook registration, protected diagnostics, and the rule that Supabase Hook and Cron activation happen only after deployed verification.

- [ ] **Step 2: Run the complete verification gate**

Run:

```powershell
npx.cmd vitest run --config vitest.unit.config.ts --maxWorkers=1 --pool=forks --no-file-parallelism
npx.cmd tsc --noEmit
npm.cmd run lint -- --quiet
npm.cmd run build
git diff --check
```

Expected: all tests pass, TypeScript/lint/build exit successfully, and the diff check is clean. If the default database-backed test command cannot connect to local PostgreSQL, report that infrastructure limitation separately from the unit-suite result.

- [ ] **Step 3: Commit documentation**

```powershell
git add README.md docs/REMINDLY_GMAIL_SUPABASE_VERCEL_REFACTOR_SPEC.md
git commit -m "docs: document Gmail integration rollout"
```
