# Multi-alert reminder migration design

## Status

Approved direction: incremental compatibility migration.

This design converts Remindly from one legacy alert per reminder to multiple
versioned alerts while preserving a safe rollback path during migration.

## Goals

- Let an authenticated user create one reminder with one or more email alerts.
- Store the authoritative reminder deadline as a timestamp with timezone-aware
  conversion at the application boundary.
- Support fixed-duration alerts and explicitly scheduled absolute alerts.
- Create and update alerts and notification-ledger rows transactionally.
- Prevent obsolete schedule versions from being sent after an edit race.
- Preserve sent notification history.
- Migrate existing single-alert reminders without losing schedules or ledger
  rows.
- Keep the implementation compatible with the current branch until the
  backfill and verification gates pass.

## Non-goals

- Gmail provider implementation.
- Supabase Auth Hook delivery.
- Supabase Cron and `pg_net` deployment.
- Changing notification channels beyond the existing email channel.
- Recurring reminders or arbitrary recurrence rules.
- User-configurable sender identities.

## Source of truth during migration

The target source of truth is:

```text
Reminder.dueAt
ReminderAlert.scheduledFor
ReminderAlert.offsetMinutes
ReminderAlert.scheduleVersion
Notification.reminderAlertId
Notification.scheduleVersion
```

Until the backfill gate passes, the legacy fields remain readable for existing
fixtures and rollback support. New authenticated reminder flows will write the
new model and may temporarily dual-populate legacy projections when required
by compatibility code. No processor or UI path may silently choose between
different schedules; each path must declare whether it is legacy or migrated.

The migration is complete only when every reminder has an owner, every active
alert has a valid notification ledger row, and all active processor reads use
the alert relation.

## Domain contract

### Reminder input

The new authenticated API contract is:

```ts
type ReminderAlertInput =
  | { kind: 'offset'; offsetMinutes: number }
  | { kind: 'absolute'; scheduledFor: string };

type CreateReminderInput = {
  name: string;
  dueAt: string;
  alerts: ReminderAlertInput[];
};
```

Update requests may change `name`, `dueAt`, or the complete alert list. Partial
alert mutation is not part of the first slice; replacing the submitted alert
set makes validation and transactional behavior explicit.

The server derives the owner from `requireUser()`. A request-supplied owner ID
is rejected or ignored and is never used for authorization.

### Validation invariants

- `name` is trimmed and limited to 120 characters.
- `dueAt` is a valid ISO timestamp and is normalized to UTC.
- At least one alert is required.
- The first implementation limits a reminder to 10 alerts.
- `offsetMinutes` is an integer greater than zero.
- An offset alert resolves to `dueAt - offsetMinutes`.
- Every resolved alert must be strictly earlier than `dueAt`.
- Absolute timestamps must be strictly earlier than `dueAt`.
- Duplicate `(scheduledFor, channel)` pairs are rejected.
- Alert timestamps are stored as `timestamptz` values.
- User timezone is used only to interpret user-facing local input; stored
  timestamps are authoritative UTC instants.

The default alert-time preference is used by the UI when creating a new alert,
not as a hidden server-side second source of truth.

## Scheduling and lifecycle behavior

### Creation

Inside one transaction:

1. Validate and normalize the input.
2. Create the owned reminder.
3. Resolve every alert into a unique `scheduledFor` instant.
4. Create one enabled `ReminderAlert` per resolved schedule with version 1.
5. Create one pending `Notification` per alert, linked by
   `reminderAlertId` and copied `scheduleVersion`.
6. Return the reminder, alerts, and notification summaries needed by the UI.

If any insert fails, the transaction rolls back the entire reminder cycle.

### Editing

Edits are evaluated against the current active reminder in a transaction.

- Name-only edits do not change alert versions or notifications.
- A `dueAt` change recomputes offset alerts.
- Absolute alerts remain fixed unless the submitted alert list changes them.
- Changed or removed future alerts receive a new version or are disabled.
- Pending and failed notifications for obsolete versions are cancelled.
- `PROCESSING` notifications are not mutated by the edit transaction.
- `SENT` notifications remain immutable history.
- New current alerts receive new pending notifications.
- The edit increments the affected alert schedule version.

The processor must reject a claimed notification if its alert is disabled, its
timestamp differs from the current alert, or its copied version is stale. This
post-claim check is required even if the claim query applies the same filters.

### Completion and renewal

Completing a reminder cancels pending and failed unsent notifications for its
alerts while preserving sent history and processing rows. Renewal archives the
source reminder and creates a new reminder cycle with a fresh alert set.

## Persistence boundaries

The schema migration is additive first:

- add `Reminder.dueAt` as nullable;
- retain legacy reminder schedule columns temporarily;
- retain `Notification.reminderId` and nullable alert/version columns while
  backfill is in progress;
- add indexes for active alerts and due notification claims;
- preserve the existing unique constraints until legacy rows are converted;
- add validation at the application layer before database constraints become
  strict.

After rehearsal and count verification:

- backfill `Reminder.dueAt` from the legacy date/time representation;
- create one `ReminderAlert` for each legacy reminder;
- link each current notification to that alert and copy version 1;
- verify reminder, alert, and notification counts;
- make ownership and alert linkage non-null;
- remove legacy schedule columns and legacy notification uniqueness only in a
  separate destructive migration.

Every destructive migration requires a database export and a documented
rollback deployment/tag.

## Repository and service interfaces

Repositories should expose focused operations rather than leaking Prisma
queries into route handlers:

- create reminder with owner scope;
- list/find reminders with alerts and current notification summaries;
- create alert-linked notification rows;
- lock and replace future alert versions transactionally;
- cancel obsolete unsent notifications;
- query current alert-linked notifications for processing;
- perform migration/backfill reconciliation with counts only.

Authenticated service methods will use explicit `userId, id, input` arguments.
The current compatibility overloads may remain only until backfill and route
cutover verification pass; they must not be used by new user-facing code.

## Processor contract

The processor will move from singleton settings and `Reminder.alertAt` to the
relationship:

```text
Notification
  -> ReminderAlert
    -> Reminder
      -> UserProfile
```

The claim query and post-claim check must require:

- notification is due and claimable;
- reminder is `ACTIVE`;
- alert is enabled;
- notification version equals alert version;
- notification timestamp equals alert timestamp;
- the profile has a verified email at send time.

Recipient and timezone data are resolved immediately before provider
invocation. Processor logs contain counts and sanitized error codes only.

Legacy processor reads remain available behind an explicit compatibility path
until all migrated rows pass verification. They must not process the same row
as the alert-aware path.

## API and UI behavior

The authenticated reminder routes will accept and return `dueAt` and an alert
collection. The UI will provide:

- a deadline date/time control;
- an alert list with add/remove actions;
- offset presets such as same day, one day, three days, and seven days before;
- custom offset input;
- an absolute date/time option;
- duplicate and invalid-order errors inline;
- a clear explanation that offset alerts move with the deadline while absolute
  alerts stay fixed.

The first UI version may use the existing drawer and design system. A visual
design review is only needed if the alert list makes the drawer interaction
ambiguous or inaccessible.

## Test strategy

### Unit tests

- ISO timestamp and alert-rule validation.
- offset and absolute schedule resolution.
- duplicate detection and strict-before-deadline rules.
- timezone and daylight-saving transitions.
- edit diff classification and version increments.

### Integration tests

- create one reminder with multiple alerts and notifications;
- atomically roll back when one alert or notification insert fails;
- preserve sent history during edits;
- cancel obsolete pending/failed rows;
- leave processing rows untouched and prevent stale sends;
- complete and renew reminders with multiple alerts;
- processor recipient resolution through `UserProfile`;
- concurrent claims cannot send the same alert twice;
- backfill preserves schedule and notification counts.

### Route and end-to-end tests

- authenticated create/edit/list flows expose all alerts;
- two users cannot read or mutate another user's reminder alerts;
- UI can add, remove, and submit multiple alerts accessibly;
- legacy fixtures continue to work until the cutover gate.

The full integration suite requires PostgreSQL. Unit verification can use the
existing `vitest.unit.config.ts`; local integration verification must report a
clear database-unavailable result rather than being mistaken for a passing
suite.

## Delivery sequence

1. Add pure domain types, validation, and scheduling tests.
2. Add additive schema migration and regenerate Prisma types.
3. Implement alert-aware repository and ledger primitives.
4. Implement transactional create/edit lifecycle behavior.
5. Update authenticated API contracts and presenters.
6. Update the reminder drawer and route/UI tests.
7. Migrate processor claim, eligibility, and recipient resolution.
8. Add legacy backfill/reconciliation command and verification report.
9. Run migration rehearsal, integration tests, typecheck, lint, and build.
10. Only then make ownership and alert linkage strict and remove compatibility
    overloads in a separately reviewable commit.

## Rollback and observability

- Keep the previous deployment available during each cutover.
- Gate alert-aware processor reads behind an explicit feature flag until the
  backfill verification passes.
- Record only aggregate migration counts, not emails or reminder content.
- Abort cutover if counts do not reconcile or if any active reminder lacks a
  current notification.
- Roll back application reads before applying destructive schema changes.

