# Remindly MVP Product and Architecture Design

**Status:** Approved direction, pending written-spec review

**Date:** 2026-08-19

**Product name:** Remindly

**Source study:** `Remindly-mvp-study.md`

## 1. Goal

Build a private, single-owner reminder application around one complete loop:

```text
Add reminder
→ understand urgency
→ receive one intended email
→ mark done or renew
```

Remindly reduces the mental load of payment and expiry deadlines. Reliability is part of the product promise, not a later infrastructure enhancement.

## 2. Approved scope

### Included

- Three-page responsive web application: Dashboard, Reminders, Settings.
- Reminder creation with name, end date, lead time, and alert time.
- Exact backend `alert_at` calculation using the configured timezone.
- Dynamic urgency: `OVERDUE`, `URGENT`, `SOON`, `SAFE`.
- Reminder lifecycle: `ACTIVE`, `DONE`, `ARCHIVED`.
- Edit, mark done, and renew workflows.
- Persistent notification ledger.
- One intended email per reminder cycle.
- Retry, duplicate protection, missed-alert recovery, stale-notification cancellation, and batch error isolation.
- Single-owner protected access.
- Operational dashboard graphs derived from reminder and notification records.
- Mobile-width usability and keyboard accessibility.

### Excluded

- Public signup or multi-user ownership.
- Financial balances, budgeting, expense tracking, or payment processing.
- Categories, tags, advanced search, or advanced filters.
- Automatic recurrence or multiple alerts per reminder.
- SMS, push, WhatsApp, or calendar integrations.
- Native mobile applications.
- AI features.
- A separate analytics warehouse or event-tracking dashboard.
- Microservices, Redis, or a dedicated queue platform.

## 3. Visual specification

The approved design is the dark-sidebar direction selected by the user.

### Reference images

- [Dashboard](../../design/references/remindly-dashboard.png)
- [Reminders](../../design/references/remindly-reminders.png)
- [Settings](../../design/references/remindly-settings.png)

The implementation must use the references as a production visual specification. The extracted tokens and component rules are stored in `.superdesign/design-system.md`.

### Application shell

- Dark graphite sidebar with the Remindly wordmark.
- Navigation: Dashboard, Reminders, Settings.
- Private workspace owner indicator at the bottom.
- True-white main canvas.
- Cobalt primary actions.
- Swiss-style, high-legibility sans-serif UI typography.
- Fine separators, modest radii, minimal shadow, and no decorative imagery.

### Dashboard

The Dashboard is an operational overview, not a finance or engagement dashboard.

It contains:

1. Quiet summary strip:
   - Active reminders.
   - Overdue reminders.
   - Due in seven days.
   - Emails accepted this month.
2. `Needs attention now` list:
   - Overdue reminders first.
   - Urgent reminders second.
3. `Reminder urgency` donut:
   - Overdue, urgent, soon, and safe counts.
   - Visible legend and text totals.
4. `Completed vs renewed` chart:
   - Monthly counts for the latest six calendar months.
5. `Next 30 days` timeline:
   - Active reminders positioned by `end_date`.
   - A visible today marker.

All dashboard values are computed from application records. No analytics table is introduced for the MVP.

### Reminders page

- Reminders are grouped and ordered `OVERDUE → URGENT → SOON → SAFE`.
- Within each group, the earliest `end_date` is first.
- Every row shows name, end date, relative time, and scheduled email date/time.
- Every urgency group uses both a semantic label and color rail.
- Row actions: Edit, Renew, Mark done.
- `+ Add reminder` opens a right-side drawer on desktop and a full-screen sheet on mobile.
- The add/edit form contains only Name, End date, Remind me, and At.
- Empty state teaches the first action and contains one Add reminder button.

### Settings page

- Notification email.
- Timezone.
- Default alert time used to initialize new-reminder forms.
- Read-only protected-access status.
- Save and cancel actions with inline success/error feedback.

## 4. Technical architecture

### Stack

- Next.js App Router and TypeScript.
- PostgreSQL.
- Prisma ORM.
- Zod validation.
- React server components by default; client components only for charts, menus, drawers, and interactive forms.
- Recharts for code-native charts.
- Lucide React for icons.
- Resend behind an `EmailProvider` interface.
- Vitest for unit and service tests.
- Playwright for end-to-end tests.
- Docker Compose for local PostgreSQL.
- GitHub Actions scheduled workflow for the notification trigger.

### Runtime boundaries

```text
Next.js route/server action
→ domain service
→ repository
→ PostgreSQL
```

API routes and server actions authenticate, parse input, invoke a service, and translate the result. They do not contain reminder, urgency, renewal, or notification state-machine logic.

### Modules

- `server/reminders`: reminder CRUD, completion, renewal, and scheduling changes.
- `server/urgency`: timezone-aware urgency and day-difference calculations.
- `server/notifications`: ledger creation, claim, send, retry, cancellation, and recovery.
- `server/email`: provider-neutral email contract and Resend adapter.
- `server/settings`: singleton owner settings and timezone-change rescheduling.
- `server/dashboard`: read-only aggregate queries.
- `server/auth`: single-owner session and scheduler endpoint authorization.
- `server/db`: Prisma client and repository implementations.

## 5. Routes and interfaces

### Pages

```text
/            Dashboard
/reminders   Reminder management
/settings    Owner settings
/login       Single-owner access
```

### API

```text
POST   /api/reminders
GET    /api/reminders
GET    /api/reminders/:id
PATCH  /api/reminders/:id
POST   /api/reminders/:id/done
POST   /api/reminders/:id/renew

GET    /api/dashboard
GET    /api/settings
PATCH  /api/settings
GET    /api/health

POST   /api/internal/process-due-notifications
```

The internal processor endpoint requires a timing-safe comparison against a server-only scheduler secret. It invokes the same notification service used by any future worker process.

## 6. Data model

### `reminders`

```text
id                  uuid primary key
name                text
end_date            date
alert_lead_days     integer
alert_time          time
alert_at            timestamptz
status              ACTIVE | DONE | ARCHIVED
parent_reminder_id  uuid nullable → reminders.id
completed_at        timestamptz nullable
created_at          timestamptz
updated_at          timestamptz
```

Indexes:

- `(status, end_date)` for the Reminders page and dashboard.
- `(status, alert_at)` for scheduling and reconciliation.
- `(parent_reminder_id)` for renewal history.

### `notifications`

```text
id                    uuid primary key
reminder_id           uuid → reminders.id
scheduled_for         timestamptz
channel               EMAIL
status                PENDING | PROCESSING | SENT | FAILED | CANCELLED
attempt_count         integer default 0
next_attempt_at       timestamptz nullable
processing_started_at timestamptz nullable
idempotency_key       text
provider_message_id   text nullable
last_error            text nullable
sent_at               timestamptz nullable
created_at            timestamptz
updated_at            timestamptz
```

Constraints and indexes:

- Unique `(reminder_id, scheduled_for, channel)`.
- Unique `idempotency_key`.
- Index `(status, next_attempt_at, scheduled_for)`.

### `settings`

```text
id                  singleton key
notification_email  text
timezone            IANA timezone string
default_alert_time  time
created_at          timestamptz
updated_at          timestamptz
```

### Authentication storage

The MVP has one owner identity. It uses an Auth.js credentials flow with an allowlisted owner email and a password hash supplied through deployment secrets. It creates a signed, HTTP-only session cookie. There is no signup, email verification, password reset, organization, role, or user-management UI.

## 7. Frozen domain decisions

### Product name

Use `Remindly` in the application, repository, email copy, and documentation. `Never Miss It` remains historical wording from the study only.

### Notification creation timing

Create the scheduled `PENDING` notification row in the same database transaction as reminder creation or renewal. An edit that changes `end_date`, `alert_lead_days`, `alert_time`, or effective timezone cancels the existing `PENDING` row and creates a replacement in the same transaction.

The periodic processor includes a reconciliation pass that creates a missing ledger row for any active reminder whose current schedule has no notification. Reconciliation is recovery, not the normal creation path.

### Atomic claiming

The processor claims due `PENDING` or retryable `FAILED` rows atomically using a PostgreSQL transaction and row locking with `FOR UPDATE SKIP LOCKED`, or an equivalent conditional update returning the claimed rows.

Only successfully claimed rows can call the email provider.

### Processing lease recovery

`PROCESSING` rows record `processing_started_at`. A processor run may reclaim a row that has remained `PROCESSING` for more than 15 minutes. Reclaiming increments the attempt count and retains the same idempotency key.

### Provider ambiguity

The notification UUID is the provider idempotency key when the provider supports idempotent sends. `SENT` means the provider accepted the request. The product guarantees one logical notification per cycle; mailbox delivery and provider-side delivery webhooks remain outside P0.

If a provider cannot support idempotency, ambiguous network outcomes are recorded explicitly and retried under the documented duplicate-risk policy instead of pretending strict external exactly-once delivery is possible.

### Retry schedule

Maximum automatic send attempts: five.

Backoff targets:

```text
attempt 1 → next processor run
attempt 2 → 5 minutes
attempt 3 → 30 minutes
attempt 4 → 2 hours
attempt 5 → 12 hours
```

The scheduler cadence can introduce additional delay. After the fifth failed attempt, the notification stays `FAILED`, appears in operational logs/health reporting, and is not retried automatically.

### Completion

Marking an active reminder done:

1. Sets reminder status to `DONE` and records `completed_at`.
2. Cancels all `PENDING` notifications for that reminder.
3. Does not interrupt a provider request already in flight.
4. Requires the processor to re-check reminder status immediately before calling the provider.

The narrow race after the final status check is mitigated by provider idempotency but cannot be represented as an interruptible external send.

### Renewal

Renewal is one database transaction:

1. Validate the source reminder and new schedule.
2. Archive the source reminder.
3. Cancel any source `PENDING` notification.
4. Create the new active reminder with `parent_reminder_id` pointing to the source.
5. Create the new reminder's `PENDING` notification.

Renewal is allowed for `ACTIVE` or `DONE` reminders. `ARCHIVED` reminders are historical and cannot be edited, completed, or renewed again.

### Editing

- Only `ACTIVE` reminders are editable.
- Name-only edits do not replace the scheduled notification.
- Schedule-affecting edits cancel the old `PENDING` row and create a new one.
- `SENT`, `FAILED`, and `PROCESSING` history is never rewritten or deleted.

### Timezone behavior

- `end_date` remains a calendar `DATE`.
- Urgency and relative-day labels use calendar-day differences in the configured IANA timezone, not elapsed 24-hour periods.
- `alert_at` is stored as `TIMESTAMPTZ`.
- Changing timezone recalculates `alert_at` for all active reminders whose notifications are still `PENDING`.
- The timezone change transaction cancels old `PENDING` rows and creates replacement rows with the newly calculated instant.
- `SENT`, `FAILED`, and `PROCESSING` rows are unchanged.

### Past dates

The owner may create an already-overdue reminder. If its calculated `alert_at` is in the past, its notification becomes immediately eligible for processing. The UI warns before saving but does not block the reminder.

## 8. Dashboard query definitions

Dashboard graphs are derived, read-only projections:

- Active reminders: count where `status = ACTIVE`.
- Overdue: active reminders where local today is after `end_date`.
- Due in seven days: active reminders with local day difference from 0 through 7, excluding overdue.
- Sent this month: notifications with `status = SENT` and `sent_at` inside the owner's local calendar month.
- Reminder urgency: grouped count of active reminders by derived urgency.
- Completed vs renewed: monthly count of `DONE` reminders and newly created reminders with non-null `parent_reminder_id` for the latest six months.
- Next 30 days: active reminders with `end_date` from local today through local today plus 30 days, plus currently overdue reminders shown at the start of the timeline.

Dashboard queries use PostgreSQL aggregation and return compact serialized data. They do not load all reminders into the browser to calculate metrics.

## 9. UI data flow

- Pages are server-rendered with initial data.
- Independent dashboard queries start in parallel and are awaited together.
- Charts receive minimal serializable datasets from server components.
- Add/edit forms use client components for local form state and submit to authenticated server actions or API routes.
- Successful mutations refresh the affected server data and close the drawer.
- Validation errors remain next to the relevant field without losing input.
- Optimistic updates are limited to reversible local UI state; notification state is never guessed on the client.

## 10. Error handling

### Forms

- Zod validates on both client and server using shared schemas.
- Server validation is authoritative.
- Duplicate submissions use disabled/pending states and mutation idempotency where needed.
- Unknown failures display a concise inline error and preserve form values.

### Notification processor

- Each claimed notification is isolated in its own error boundary/transactional outcome.
- One failure cannot abort the remaining batch.
- Provider errors store a sanitized message in `last_error`.
- Logs include notification ID, reminder ID, attempt count, state transition, and provider message ID when available; they exclude reminder secrets and credentials.

### Settings

- Invalid email or timezone is rejected before any rescheduling occurs.
- Timezone updates and pending-notification replacement are atomic.
- A failed transaction leaves the previous timezone and schedules unchanged.

## 11. Security

- All pages and owner APIs require an authenticated owner session except `/login` and `/api/health`.
- The scheduler endpoint uses a separate server-only secret and is not authorized by browser cookies.
- CSRF-safe framework defaults apply to mutations.
- Secrets never appear in client bundles or committed environment files.
- Health output contains readiness state, not reminder contents or provider credentials.
- Database and provider errors are sanitized before reaching the UI.

## 12. Accessibility and responsive behavior

- Meet WCAG 2.2 AA for text, focus, form labels, and interaction states.
- Urgency always has a visible word label.
- Charts include accessible names, legends, and screen-reader summaries/data tables.
- Drawers trap focus, close with Escape, and restore focus.
- Menus and navigation are keyboard operable.
- Reduced-motion preferences disable non-essential transitions.
- Desktop, tablet, and mobile widths preserve every required reminder field.
- Mobile dashboard prioritizes Needs attention before historical charts.

## 13. Testing strategy

Implementation follows test-driven development.

### Unit tests

- Urgency boundaries: overdue, 0-3 days, 4-14 days, 15+ days.
- Calendar-day arithmetic in `Africa/Casablanca`, including offset changes.
- `alert_at` calculation.
- Retry backoff and maximum attempts.
- Allowed reminder and notification state transitions.
- Dashboard aggregation date boundaries.

### Service and repository integration tests

- Create reminder and notification atomically.
- Concurrent processors claim one row once.
- Expired processing lease is reclaimed.
- Mark done cancels pending notification.
- Schedule edit cancels and replaces pending notification.
- Timezone change cancels and recreates pending notification.
- Renewal archives the source and creates the new cycle atomically.
- Batch error isolation.
- Provider idempotency key reuse after an ambiguous failure.

### End-to-end tests

- Owner login and protected route behavior.
- Empty state to first reminder.
- Add reminder, verify urgency and scheduled email.
- Edit schedule and verify updated presentation.
- Mark done and remove from active view.
- Renew and verify new active cycle.
- Navigate Dashboard, Reminders, and Settings.
- Save timezone/email settings.
- Desktop and mobile core flows.

### Visual verification

- Capture Dashboard, Reminders, open reminder drawer, Settings, and mobile states.
- Compare implementation screenshots with the three approved reference images.
- Check copy, hierarchy, palette, typography, spacing, borders, radii, icons, charts, and responsive behavior.
- Use the in-app Browser first; if unavailable, document the fallback before using Playwright.

## 14. Deployment and operations

- Next.js application deployed as one service.
- Managed PostgreSQL in production.
- GitHub Actions scheduled workflow calls `/api/internal/process-due-notifications` every 5-15 minutes on a best-effort basis.
- The processor queries with `scheduled_for <= now` and `next_attempt_at <= now` where applicable, so late triggers recover missed work.
- Resend is configured through the provider adapter.
- Docker Compose runs PostgreSQL locally.
- Deployment requires owner-auth secrets, scheduler secret, database URL, email provider credentials, notification email, and canonical application URL.

## 15. Implementation sequence

1. Project foundation, linting, testing, environment validation, and local PostgreSQL.
2. Prisma schema and migrations.
3. Domain types, urgency, scheduling, and validation tests.
4. Single-owner authentication and protected shell.
5. Reminder create/read/update and notification-row creation.
6. Reminders page, drawer, empty state, and responsive layout.
7. Done, edit invalidation, renewal, and archive chain.
8. Notification claim/send/retry/recovery state machine.
9. Settings and timezone rescheduling.
10. Dashboard aggregate queries and charts.
11. Email integration and scheduler workflow.
12. End-to-end, accessibility, visual-fidelity, and deployment verification.

## 16. Acceptance criteria

The MVP is complete when:

- The approved three-page UI is faithfully implemented at desktop and mobile widths.
- A reminder can be added in approximately 15 seconds.
- Urgency, ordering, and dashboard graphs are correct in the configured timezone.
- Add, edit, done, renew, and settings flows work through the UI and server.
- Every reminder cycle has one logical notification record and one intended provider send.
- Duplicate processor runs do not duplicate logical notification work.
- Temporary failures retry and abandoned processing leases recover.
- Downtime does not permanently lose due notifications.
- Edits, completion, renewal, and timezone changes do not leave stale `PENDING` rows.
- Overdue reminders remain visible until the owner acts.
- The full end-to-end acceptance flow passes.
- Build, lint, unit, integration, and end-to-end checks pass.
- Browser screenshots pass direct visual comparison with the approved references.

## 17. Deferred decisions

These remain explicitly outside this implementation plan:

- Public multi-user authentication and per-user data ownership.
- Delivery webhooks, bounce processing, and mailbox-delivery analytics.
- Manual admin UI for permanently failed notifications.
- Additional notification channels.
- Automatic recurrence.
- Archived-history browsing beyond retaining the renewal chain in storage.
