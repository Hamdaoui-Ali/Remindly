# Reminder Backfill Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the legacy reminder backfill create exactly one current alert-linked notification when the legacy notification is absent, while preserving delivery history and idempotent reruns.

**Architecture:** Keep conversion decisions pure in `src/server/reminders/backfill.ts`. Extend the plan with a notification-create operation, then let the CLI apply that operation inside the existing per-reminder transaction. Existing matching notifications are linked in place; `SENT`, `FAILED`, and `PROCESSING` state is never rewritten by backfill.

**Tech Stack:** TypeScript, Prisma 7, PostgreSQL, Vitest, Next.js 16.

**Spec:** `docs/REMINDLY_GMAIL_SUPABASE_VERCEL_REFACTOR_SPEC.md`, section 40.1; `docs/superpowers/specs/2026-08-30-multi-alert-reminder-design.md`, sections 8 and 12.

## Global Constraints

- The command remains dry-run by default and writes only with `--apply`.
- Normal output contains aggregate counts and sanitized issue codes only; never log recipient email, reminder content, tokens, or secrets.
- Existing notification delivery status and history remain unchanged during linking.
- Rerunning the command must not create duplicate alerts or notifications.
- Active reminders without an owner remain a verification failure and are never applied.

---

### Task 1: Extend the pure backfill plan for missing notifications

**Files:**
- Modify: `src/server/reminders/backfill.ts`
- Modify: `tests/unit/reminder-backfill.test.ts`

**Interfaces:**
- Consumes: `LegacyBackfillReminder`, `LegacyBackfillNotification`, and the existing timezone input.
- Produces: `LegacyBackfillPlan.notificationCreate`, either `null` or `{ id, reminderId, reminderAlertId, scheduledFor, scheduleVersion, channel, status, idempotencyKey }`.

- [ ] **Step 1: Write the failing test**

Add this assertion to the existing missing-notification test:

```ts
expect(plan.notificationCreate).toMatchObject({
  id: expect.any(String),
  reminderId: reminder.id,
  reminderAlertId: 'alert-1',
  scheduledFor: reminder.alertAt,
  scheduleVersion: 1,
  channel: 'EMAIL',
  status: 'PENDING',
});
```

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run: `npx vitest run tests/unit/reminder-backfill.test.ts --config vitest.unit.config.ts`

Expected: FAIL because `notificationCreate` is not present in the plan.

- [ ] **Step 3: Implement the smallest pure plan change**

Add the nullable `notificationCreate` field to `LegacyBackfillPlan`. When exactly one legacy reminder has no matching current notification, return the normal version-one alert plus:

```ts
notificationCreate: {
  id: crypto.randomUUID(),
  reminderId: reminder.id,
  reminderAlertId: input.alertId,
  scheduledFor: reminder.alertAt,
  scheduleVersion: 1,
  channel: 'EMAIL',
  status: 'PENDING',
  idempotencyKey: crypto.randomUUID(),
}
```

Keep `missing_notification` out of `issues` for this recoverable case. Return `notificationCreate: null` for invalid-owner, invalid-date, duplicate-match, and existing-notification plans.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: `npx vitest run tests/unit/reminder-backfill.test.ts --config vitest.unit.config.ts`

Expected: all backfill unit tests PASS, including the existing sent-notification test with `notificationCreate: null`.

- [ ] **Step 5: Commit**

```bash
git add src/server/reminders/backfill.ts tests/unit/reminder-backfill.test.ts
git commit -m "feat: plan missing backfill notifications"
```

### Task 2: Apply missing notification plans safely

**Files:**
- Modify: `scripts/backfill-reminder-alerts.ts`
- Modify: `tests/unit/reminder-backfill.test.ts`
- Modify: `docs/REMINDLY_GMAIL_SUPABASE_VERCEL_REFACTOR_SPEC.md`

**Interfaces:**
- Consumes: `LegacyBackfillPlan.notificationCreate` from Task 1.
- Produces: dry-run/apply reports where `notificationsCreated` counts newly created current notifications and reruns remain idempotent.

- [ ] **Step 1: Write the failing report assertion**

Extend `BackfillReport` and its test fixture with `notificationsCreated: 1` for a newly-created notification. Keep `notificationsLinked` at `0` for that case and retain `notificationsLinked: 1` for an existing notification.

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run: `npx vitest run tests/unit/reminder-backfill.test.ts --config vitest.unit.config.ts`

Expected: FAIL because the report does not yet distinguish created notifications.

- [ ] **Step 3: Apply the create operation inside the existing transaction**

In `scripts/backfill-reminder-alerts.ts`, increment `notificationsCreated` from `plan.notificationCreate`, and in apply mode create the row after creating the alert:

```ts
await tx.notification.create({
  data: {
    id: create.id,
    reminderId: create.reminderId,
    reminderAlertId: create.reminderAlertId,
    scheduledFor: create.scheduledFor,
    scheduleVersion: create.scheduleVersion,
    channel: create.channel,
    status: create.status,
    idempotencyKey: create.idempotencyKey,
  },
});
```

Before applying, re-read the reminder’s alert relation inside the transaction and skip creation if a current alert already exists. This makes retries safe even if a prior run committed before the process stopped. Update the checkpoint text to state that missing current notifications are created, not reported as unrecoverable.

- [ ] **Step 4: Run focused tests, typecheck, lint, and build**

Run:

```bash
npx vitest run tests/unit/reminder-backfill.test.ts --config vitest.unit.config.ts
npx tsc --noEmit
npm run lint -- --quiet
npm run build
```

Expected: all commands PASS. If the database-backed command is exercised separately and PostgreSQL is unavailable, record the exact connection error without treating it as a code failure.

- [ ] **Step 5: Commit**

```bash
git add scripts/backfill-reminder-alerts.ts tests/unit/reminder-backfill.test.ts docs/REMINDLY_GMAIL_SUPABASE_VERCEL_REFACTOR_SPEC.md
git commit -m "feat: create missing notifications during backfill"
```
