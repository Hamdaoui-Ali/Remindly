# Multi-alert Reminder Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate authenticated Remindly reminders from one legacy alert to multiple timezone-aware, versioned alert schedules with durable notification rows.

**Architecture:** Introduce a pure alert-rule domain layer first, then add `Reminder.dueAt` and alert-linked notification persistence additively. The authenticated lifecycle becomes the new write path while legacy fields remain readable until backfill verification; the processor switches to `Notification -> ReminderAlert -> Reminder -> UserProfile` only after its eligibility and race tests pass.

**Tech Stack:** Next.js 16, TypeScript, Zod, Prisma 7, PostgreSQL/Supabase, date-fns-tz, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-30-multi-alert-reminder-design.md`

## Global Constraints

- The server derives ownership from `requireUser()`; client-supplied owner IDs are never authorization inputs.
- `Reminder.dueAt`, `ReminderAlert.scheduledFor`, and notification schedule versions are the target source of truth.
- Offset alerts resolve as `dueAt - offsetMinutes`; absolute alerts remain fixed unless explicitly edited.
- Sent notifications remain immutable; `PROCESSING` rows are not mutated by edit transactions.
- Every active alert must have a current notification with matching timestamp and schedule version.
- No recipient email, reminder content, token, or secret may appear in normal migration/processor logs.
- Keep legacy fields readable until backfill counts and processor cutover verification pass.
- Use TDD: write each failing test, run it to confirm the expected failure, implement the smallest change, then rerun the focused suite.

---

### Task 1: Define and test alert-rule validation and scheduling

**Files:**
- Create: `src/server/reminders/alerts.ts`
- Modify: `src/server/validation/reminders.ts`
- Modify: `src/server/urgency/scheduling.ts`
- Test: `tests/unit/reminder-alerts.test.ts`
- Test: `tests/unit/reminder-validation.test.ts`

**Interfaces:**
- Consumes: profile timezone and normalized `dueAt` input.
- Produces:
  - `type ReminderAlertInput = { kind: 'offset'; offsetMinutes: number } | { kind: 'absolute'; scheduledFor: string }`.
  - `type ResolvedReminderAlert = { scheduledFor: Date; offsetMinutes: number | null }`.
  - `resolveReminderAlerts(dueAt: Date, alerts: ReminderAlertInput[], timezone: string): ResolvedReminderAlert[]`.
  - `reminderInputSchema` accepting `{ name, dueAt, alerts }` for authenticated routes.

- [ ] **Step 1: Write failing unit tests** for one offset alert, one absolute alert, duplicate schedules, zero/negative offsets, ten-alert maximum, strict-before-deadline validation, malformed timestamps, and a DST boundary.

- [ ] **Step 2: Run the focused tests**

Run: `npx vitest run tests/unit/reminder-alerts.test.ts tests/unit/reminder-validation.test.ts --config vitest.unit.config.ts`

Expected: FAIL because the new alert contract and resolver do not exist.

- [ ] **Step 3: Implement the minimal pure resolver and Zod schemas**

Use UTC `Date` values for persistence. Interpret local date/time strings with the supplied IANA timezone before resolving to an instant. Reject duplicate resolved timestamps and any timestamp greater than or equal to `dueAt`.

- [ ] **Step 4: Rerun the focused tests**

Expected: PASS, including the DST and duplicate cases.

- [ ] **Step 5: Commit**

```bash
git add src/server/reminders/alerts.ts src/server/validation/reminders.ts src/server/urgency/scheduling.ts tests/unit/reminder-alerts.test.ts tests/unit/reminder-validation.test.ts
git commit -m "feat: add multi-alert reminder domain rules"
```

### Task 2: Add the additive alert-aware database shape

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260831090000_add_reminder_due_at/migration.sql`
- Modify: generated Prisma files through `npm run db:generate`
- Test: `tests/integration/refactor-schema.test.ts`

**Interfaces:**
- Consumes: existing `ReminderAlert` and nullable `Notification.reminderAlertId`/`scheduleVersion` fields.
- Produces: nullable `Reminder.dueAt`, indexes supporting active alert claims, and Prisma types exposing the new field and alert relations.

- [ ] **Step 1: Add a failing schema assertion** that `reminders.due_at` exists as a timestamptz-compatible column and that alert-linked notification metadata remains available.

- [ ] **Step 2: Run the schema test**

Run: `npx vitest run tests/integration/refactor-schema.test.ts --config vitest.config.ts`

Expected: FAIL when PostgreSQL is available because `due_at` is absent; if local PostgreSQL is unavailable, record the explicit connection error and continue with schema validation through generated Prisma types.

- [ ] **Step 3: Add the additive Prisma migration**

Add nullable `dueAt DateTime? @map("due_at") @db.Timestamptz(6)` and an index suitable for reminder status/deadline reads. Do not drop legacy columns or make alert foreign keys non-null in this migration.

- [ ] **Step 4: Generate Prisma types and run schema/type checks**

Run: `npm run db:generate` and `npx tsc --noEmit`.

Expected: generated types expose `Reminder.dueAt` and existing compatibility code still typechecks.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/generated/prisma tests/integration/refactor-schema.test.ts
git commit -m "feat: add nullable reminder due timestamp"
```

### Task 3: Implement alert-linked ledger and reminder repository primitives

**Files:**
- Modify: `src/server/reminders/repository.ts`
- Modify: `src/server/notifications/repository.ts`
- Modify: `src/server/notifications/ledger.ts`
- Create: `src/server/reminders/alert-repository.ts`
- Test: `tests/unit/notification-repository.test.ts`
- Test: `tests/integration/repositories.test.ts`

**Interfaces:**
- Consumes: `ResolvedReminderAlert[]`, an owned reminder ID, and Prisma transaction context.
- Produces:
  - `createAlertsWithNotifications(tx, reminderId, alerts)` returning alert and notification rows.
  - `replaceFutureAlerts(tx, reminderId, nextAlerts, now)` preserving `SENT` history and returning current alert-linked notifications.
  - `cancelObsoleteUnsentNotifications(tx, alertIds)` updating only `PENDING` and `FAILED` rows.

- [ ] **Step 1: Write failing repository/ledger tests** for creating two alert rows and two linked notifications, idempotent retry, preserving sent history, cancelling pending/failed obsolete rows, and leaving processing rows unchanged.

- [ ] **Step 2: Run the focused repository tests**

Run: `npx vitest run tests/unit/notification-repository.test.ts tests/integration/repositories.test.ts --config vitest.config.ts`

Expected: FAIL because creation and replacement primitives do not exist.

- [ ] **Step 3: Implement alert-linked persistence primitives**

Generate notification IDs in the application, copy `scheduleVersion` into each notification, and use the existing database uniqueness constraints for idempotency. Use transactions and conditional updates for status-sensitive cancellation.

- [ ] **Step 4: Rerun focused tests and typecheck**

Expected: PASS where PostgreSQL is available; otherwise unit tests and `npx tsc --noEmit` must still pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/reminders/repository.ts src/server/reminders/alert-repository.ts src/server/notifications/repository.ts src/server/notifications/ledger.ts tests/unit/notification-repository.test.ts tests/integration/repositories.test.ts
git commit -m "feat: add alert-linked notification ledger primitives"
```

### Task 4: Switch authenticated reminder lifecycle to multiple alerts

**Files:**
- Modify: `src/server/reminders/types.ts`
- Modify: `src/server/reminders/service.ts`
- Modify: `src/server/reminders/presenters.ts`
- Modify: `src/app/api/reminders/route.ts`
- Modify: `src/app/api/reminders/[id]/route.ts`
- Modify: `src/app/api/reminders/[id]/renew/route.ts`
- Test: `tests/integration/reminder-lifecycle.test.ts`
- Test: `tests/app/reminder-routes.test.ts`

**Interfaces:**
- Consumes: `reminderInputSchema`, `resolveReminderAlerts`, and alert repository primitives.
- Produces:
  - `CreateReminderInput { name: string; dueAt: string; alerts: ReminderAlertInput[] }`.
  - `UpdateReminderInput { name?: string; dueAt?: string; alerts?: ReminderAlertInput[] }`.
  - `ReminderCycle { reminder; alerts; notifications }`.

- [ ] **Step 1: Write failing lifecycle tests** for creating multiple alerts, updating only the name without changing versions, changing `dueAt` and recomputing offset alerts, retaining absolute alerts, replacing alerts transactionally, and enforcing ownership.

- [ ] **Step 2: Run the focused lifecycle and route tests**

Run: `npx vitest run tests/integration/reminder-lifecycle.test.ts tests/app/reminder-routes.test.ts --config vitest.config.ts`

Expected: FAIL against the current single-alert service contract.

- [ ] **Step 3: Implement transactional create/update/renew behavior**

For authenticated calls, write `dueAt`, create or replace alert rows, and create current notifications in one transaction. Keep the existing legacy path only for compatibility fixtures. Do not mutate `PROCESSING` or `SENT` rows during replacement.

- [ ] **Step 4: Update presenters and API responses**

Return `dueAt` and alert summaries; do not expose internal compatibility fields as the authenticated API contract.

- [ ] **Step 5: Rerun focused tests, typecheck, and lint**

Expected: authenticated route/lifecycle tests pass; legacy compatibility tests remain green.

- [ ] **Step 6: Commit**

```bash
git add src/server/reminders src/app/api/reminders tests/integration/reminder-lifecycle.test.ts tests/app/reminder-routes.test.ts
git commit -m "feat: create and edit multiple reminder alerts"
```

### Task 5: Update the reminder editor and accessible route coverage

**Files:**
- Modify: `src/components/reminders/reminder-drawer.tsx`
- Modify: `src/components/reminders/reminders-page.tsx`
- Modify: `src/components/reminders/reminder-group.tsx`
- Modify: `tests/app/drawer.test.tsx`
- Modify: `tests/app/reminders-page.test.tsx`

**Interfaces:**
- Consumes: authenticated API payloads containing `dueAt` and alert summaries.
- Produces: an accessible alert list with add/remove controls, offset presets, custom offsets, absolute date/time input, duplicate errors, and deadline-order errors.

- [ ] **Step 1: Write failing component tests** for adding a second alert, removing an alert, rendering existing alerts during edit, rejecting an empty alert list, showing offset/absolute descriptions, and preserving focus after drawer close.

- [ ] **Step 2: Run the component tests**

Run: `npx vitest run tests/app/drawer.test.tsx tests/app/reminders-page.test.tsx --config vitest.unit.config.ts`

Expected: FAIL because the drawer currently has one `leadDays`/`alertTime` pair.

- [ ] **Step 3: Implement the alert-list form using existing UI primitives**

Keep the existing drawer and design tokens. Use stable client keys for unsaved alert rows, submit only the documented API contract, and map server field errors back to the relevant alert row.

- [ ] **Step 4: Rerun component tests and accessibility checks**

Run: `npx vitest run tests/app/drawer.test.tsx tests/app/reminders-page.test.tsx --config vitest.unit.config.ts` and `npm run lint -- --quiet`.

Expected: PASS with no new accessibility or lint errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/reminders tests/app/drawer.test.tsx tests/app/reminders-page.test.tsx
git commit -m "feat: add accessible multi-alert reminder editor"
```

### Task 6: Migrate notification processing to alert/version eligibility

**Files:**
- Modify: `src/server/notifications/repository.ts`
- Modify: `src/server/notifications/processor.ts`
- Modify: `src/server/notifications/recovery.ts`
- Test: `tests/integration/notification-processor.test.ts`
- Test: `tests/unit/retry-policy.test.ts`

**Interfaces:**
- Consumes: alert-linked notifications and `UserProfile` email/timezone fields.
- Produces: processor claims that include alert/version/reminder/profile data and send only eligible current schedules.

- [ ] **Step 1: Write failing processor tests** for two due alerts, future alert untouched, disabled alert cancelled, stale version cancelled, mismatched timestamp cancelled, unverified profile skipped, and concurrent claims sending once.

- [ ] **Step 2: Run the processor tests**

Run: `npx vitest run tests/integration/notification-processor.test.ts tests/unit/retry-policy.test.ts --config vitest.config.ts`

Expected: FAIL because the processor currently reads `Settings` and `Reminder.alertAt`.

- [ ] **Step 3: Update claim SQL and post-claim checks**

Join alert/reminder/profile data in the processor query, filter current active/enabled/version-matching rows before leasing, and repeat the checks immediately before provider invocation. Resolve the recipient from the current verified profile.

- [ ] **Step 4: Preserve compatibility behind an explicit legacy path**

Do not allow the legacy and alert-aware paths to claim the same alert-linked row. Keep legacy handling only for rows that have no alert relation during the migration window.

- [ ] **Step 5: Rerun processor tests, typecheck, lint, and build**

Run: `npx vitest run tests/integration/notification-processor.test.ts tests/unit/retry-policy.test.ts --config vitest.config.ts`, `npx tsc --noEmit`, `npm run lint -- --quiet`, and `npm run build`.

Expected: alert-aware processor tests pass; the build succeeds; unavailable PostgreSQL is reported separately for integration tests.

- [ ] **Step 6: Commit**

```bash
git add src/server/notifications tests/integration/notification-processor.test.ts tests/unit/retry-policy.test.ts
git commit -m "feat: process current reminder alert versions"
```

### Task 7: Backfill legacy reminders and define the cutover gate

**Files:**
- Create: `scripts/backfill-reminder-alerts.ts`
- Create: `tests/unit/reminder-backfill.test.ts`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/REMINDLY_GMAIL_SUPABASE_VERCEL_REFACTOR_SPEC.md`
- Modify: `docs/superpowers/specs/2026-08-30-multi-alert-reminder-design.md`

**Interfaces:**
- Consumes: legacy `Reminder.endDate`, `Reminder.alertTime`, `Reminder.alertAt`, singleton timezone, and existing notifications.
- Produces: a dry-run-by-default command with `--apply`, aggregate counts, orphan/mismatch counts, and no email/content logging.

- [ ] **Step 1: Write failing pure backfill tests** for converting one legacy reminder, linking its current notification to version 1, preserving an existing sent row, detecting missing owners, and remaining write-free in dry-run mode.

- [ ] **Step 2: Run the backfill unit tests**

Run: `npx vitest run tests/unit/reminder-backfill.test.ts --config vitest.unit.config.ts`

Expected: FAIL because the backfill module and command do not exist.

- [ ] **Step 3: Implement dry-run/apply backfill logic**

Page through reminders, resolve the legacy schedule once using the owner/profile timezone, set nullable `dueAt`, insert one alert, link the current notification, and report counts. Wrap apply-mode changes in transactions and make reruns idempotent.

- [ ] **Step 4: Add a verification gate**

The command must fail cutover verification when any active reminder lacks an owner, any alert lacks a current notification, counts differ from the source population, or any linked notification has a mismatched schedule version/timestamp.

- [ ] **Step 5: Document execution and rollback**

Document backup/export, dry-run, apply, verification, rollback deployment, and the conditions for making ownership and alert linkage non-null.

- [ ] **Step 6: Commit**

```bash
git add scripts/backfill-reminder-alerts.ts tests/unit/reminder-backfill.test.ts package.json README.md docs/REMINDLY_GMAIL_SUPABASE_VERCEL_REFACTOR_SPEC.md docs/superpowers/specs/2026-08-30-multi-alert-reminder-design.md
git commit -m "feat: add legacy reminder alert backfill"
```

### Task 8: Final verification and strict-schema cutover

**Files:**
- Create: `prisma/migrations/20260831100000_enforce_alert_cutover/migration.sql`
- Modify: `prisma/schema.prisma`
- Modify: `src/server/reminders/service.ts`
- Modify: `src/server/reminders/repository.ts`
- Modify: `src/server/reminders/types.ts`
- Modify: `src/server/notifications/ledger.ts`
- Modify: `src/server/notifications/repository.ts`
- Modify: `src/server/notifications/processor.ts`
- Modify: `src/server/notifications/recovery.ts`
- Test: all affected unit, app, and integration suites

- [ ] **Step 1: Run the migration rehearsal and backfill dry-run**

Run: `npx prisma migrate deploy` against the isolated migration database, then `npm run reminders:backfill -- --dry-run`.

Expected: counts reconcile and no PII appears in output.

- [ ] **Step 2: Run the full available verification set**

Run: `npx vitest run --config vitest.unit.config.ts --maxWorkers=1`, `npx tsc --noEmit`, `npm run lint -- --quiet`, `npm run build`, and `git diff --check`.

Expected: unit/app tests, typecheck, lint, build, and whitespace checks pass. Integration failures caused solely by unavailable PostgreSQL must be recorded with the exact connection error.

- [ ] **Step 3: Add the strict migration only after the gate passes**

Make `Reminder.userId`, `Reminder.dueAt`, `Notification.reminderAlertId`, and `Notification.scheduleVersion` non-null only after the backfill report proves all rows satisfy the constraints. Drop legacy schedule columns and compatibility overloads in a separately reviewable migration/commit.

- [ ] **Step 4: Commit the cutover separately**

```bash
git add prisma src tests docs
git commit -m "chore: enforce multi-alert reminder cutover"
```
