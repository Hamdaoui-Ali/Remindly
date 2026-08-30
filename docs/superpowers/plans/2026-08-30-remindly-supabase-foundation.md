# Remindly Supabase Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` to execute this plan task by task.

**Goal:** Add the Supabase-compatible database and connection foundation for the Remindly refactor while preserving the current single-owner application behavior until the later Auth and ownership slices are implemented.

**Architecture:** Keep Prisma as the application data layer. Runtime queries use the Supabase pooled `DATABASE_URL`; Prisma migration and schema operations use the direct/session `DIRECT_URL`. Add the target identity, alert, schedule-version, and operational-ledger structures additively. Retain the current `Settings`, legacy reminder fields, and legacy notification fields during this slice so the existing product and tests remain usable during the migration.

**Tech Stack:** Next.js 16, TypeScript, Prisma 7, PostgreSQL/Supabase, Vitest, Docker PostgreSQL for local integration tests.

**Specification:** `docs/REMINDLY_GMAIL_SUPABASE_VERCEL_REFACTOR_SPEC.md`, sections 4.4, 7, 8, 14, 16.4, 18, 36, and 37.

## Constraints and non-goals

- Do not implement Supabase Auth, `src/proxy.ts`, Gmail delivery, the Auth Hook, Cron, or the multi-user API in this slice.
- Do not remove or rename the existing `Settings`, `Reminder`, or legacy `Notification` columns and relations yet.
- Do not make a Supabase network call in the standard test suite.
- Do not commit `.env`, access tokens, refresh tokens, private keys, or generated secrets.
- Use `timestamptz`-compatible Prisma `DateTime` columns for new operational timestamps.
- Use UUID-compatible string identifiers for Supabase user/profile identity and preserve referential integrity for new application-owned rows.
- Every logical task ends with a focused verification command and its own commit.
- If a migration cannot be safely additive, stop before editing the migration and document the exact conflict; do not reset or rewrite existing migrations.

## Task 1: Make Prisma connection roles explicit

**Files:** `prisma.config.ts`, `src/lib/env.ts`, `.env.example`, `tests/unit/env.test.ts`, `README.md`.

**Changes:**

1. Change Prisma CLI configuration so migration/introspection commands read `DIRECT_URL`, while application runtime continues to read `DATABASE_URL`.
2. Add `DIRECT_URL` to the environment contract and make the error explain that it must be a direct/session connection, not the transaction pooler URL.
3. Keep the local Docker workflow understandable by documenting the two-role setup in `.env.example` and the database setup section of `README.md`. The local direct URL may point to the existing PostgreSQL port; the hosted setup must use Supabase’s direct/session URL.
4. Preserve the test harness’s safe `_test` database rewriting. Tests must not accidentally run against the production database or the base local database.
5. Add unit coverage for: missing `DIRECT_URL`, valid separate runtime/direct URLs, and the existing test-database safety behavior.

**Verification:**

```powershell
npm test -- tests/unit/env.test.ts
npx prisma validate
```

**Commit:** `chore: separate Prisma runtime and migration database urls`

## Task 2: Add failing integration coverage for the target schema

**Files:** `tests/integration/refactor-schema.test.ts`, `tests/integration/db-schema.test.ts`.

**Changes:**

1. Add integration assertions for one-to-one `UserProfile.email` uniqueness and the profile-to-reminder ownership relation.
2. Add assertions for `ReminderAlert` uniqueness on `(reminderId, scheduledFor, channel)` and its relation to `Reminder`.
3. Add assertions that a notification carries `scheduleVersion` and references its alert through `reminderAlertId`.
4. Add assertions for `EmailSendAttempt` and `ProcessorRun`, including enum values, unique/idempotency fields, and the processor run status field.
5. Keep the existing singleton `Settings` and legacy notification uniqueness tests unchanged and passing.
6. Make the new assertions describe additive compatibility: existing fixtures can still create a legacy reminder without a `userId` until the ownership migration slice makes it required.

**Verification:**

```powershell
npm test -- tests/integration/refactor-schema.test.ts tests/integration/db-schema.test.ts
```

This task is expected to fail before Task 3 because the new Prisma models and fields do not exist yet.

**Commit:** `test: specify the Supabase refactor schema invariants`

## Task 3: Add the additive Prisma schema foundation

**Files:** `prisma/schema.prisma`.

**Changes:**

1. Add `UserProfile` with UUID-compatible `id`, unique email, nullable verification timestamp, timezone, default alert time, timestamps, and a one-to-many reminder relation.
2. Add nullable `userId` to `Reminder` with an indexed relation to `UserProfile` and `onDelete: Cascade`. Nullable is deliberate until the later backfill and ownership-enforcement task is complete.
3. Add `ReminderAlert` with `reminderId`, `scheduledFor`, `offsetMinutes`, `scheduleVersion`, `channel`, `enabled`, timestamps, the alert-to-reminder relation, and the unique alert key required by the spec.
4. Add nullable `reminderAlertId` and `scheduleVersion` to `Notification`, plus the additive alert relation and indexes needed for due-row lookup. Preserve the current `reminderId`, `scheduledFor`, and legacy unique constraint for compatibility.
5. Add the `EmailAttemptOutcome`, `ProcessorRunStatus`, `EmailSendAttempt`, and `ProcessorRun` models with sanitized error/provider metadata, reservation identifiers, timestamps, and indexes supporting budget and operational queries.
6. Keep all new enum names and field names aligned with the spec so later repository code does not need a second rename migration.
7. Run Prisma formatting and generation; do not hand-edit generated client output.

**Verification:**

```powershell
npx prisma format
npx prisma validate
npx prisma generate
npm test -- tests/integration/refactor-schema.test.ts tests/integration/db-schema.test.ts
```

**Commit:** `feat: add additive Supabase refactor data models`

## Task 4: Create and rehearse the additive migration

**Files:** the Prisma-generated migration directory under `prisma/migrations/`, `tests/integration/refactor-schema.test.ts`.

**Changes:**

1. Create one named Prisma migration from the additive schema change. Review the SQL before applying it.
2. Confirm the SQL creates new tables, indexes, enums, and nullable columns without dropping legacy tables, columns, constraints, or data.
3. Apply the migration to the test database through the normal migration path and run the schema tests against the migrated database.
4. Add a migration-rehearsal assertion that an existing legacy `Settings` row and a legacy reminder/notification fixture remain readable after the migration.
5. Verify migration status and generated-client consistency. If the local database contains unrelated migration drift, report it and do not repair it destructively.

**Verification:**

```powershell
npx prisma migrate deploy
npx prisma migrate status
npm test -- tests/integration/refactor-schema.test.ts tests/integration/db-schema.test.ts
npm run lint
```

**Commit:** `db: migrate additive Supabase refactor foundation`

## Task 5: Document the boundary to the next implementation slice

**Files:** `docs/REMINDLY_GMAIL_SUPABASE_VERCEL_REFACTOR_SPEC.md`, `README.md`, `docs/superpowers/plans/2026-08-30-remindly-supabase-foundation.md` only if verification changes the plan.

**Changes:**

1. Record the migration name and the exact compatibility state: `Reminder.userId`, `Notification.reminderAlertId`, and the new profile/alert/operational tables exist, but legacy owner authorization and legacy notification processing remain active.
2. Add an explicit handoff checklist for the next slice: Supabase Auth client/server setup, profile trigger and deletion policy, `requireUser`, Next.js 16 Proxy, and authenticated ownership tests.
3. Document that the Auth profile trigger is intentionally not part of this local Prisma migration because it depends on the hosted Supabase `auth.users` schema and must be deployed/rehearsed through the Supabase SQL workflow.
4. Verify the final diff and repository status before committing the documentation boundary.

**Verification:**

```powershell
git diff --check
npm test
npm run build
git status --short --branch
```

**Commit:** `docs: define Supabase foundation handoff`

## Final acceptance criteria for this plan

- Prisma CLI can validate and migrate through `DIRECT_URL` without using the runtime pooler URL.
- The new profile, alert, schedule-version, send-attempt, and processor-run structures exist in PostgreSQL.
- Existing single-owner behavior, legacy settings, and legacy notification tests still pass.
- No test or migration requires a live Supabase Auth project, Gmail account, Vercel deployment, or paid service.
- Migration SQL is additive and reviewed; no destructive reset or migration rewrite was used.
- The repository has one focused commit per logical task and a clear handoff to the Auth/ownership slice.
