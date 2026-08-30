# Never Miss It — Reconciled Product & Technical Study (MVP)

> **Revision status:** This is the verified, final version. It incorporates the reconciled study as authoritative and closes three gaps found during verification: an explicit hosting/deployment decision for the notification processor (§35.1), a `CANCELLED` notification state (§22, §24, §33.2, §43.4), and a concrete invalidation rule for edits made before a notification fires (§43.6). Nothing else in the reconciled study was changed.

## 1. Executive Summary

**Never Miss It** is a lightweight personal life-admin reminder application built around one simple promise:

> **Record an important payment or expiry deadline once, then trust the application to remind you before it becomes due.**

The MVP focuses exclusively on the complete reminder lifecycle:

**Add reminder → See urgency → Receive one reliable email → Mark done or renew**

The application is deliberately narrow. It is **not** a finance manager, calendar system, subscription tracker, budgeting tool, AI assistant, or general task manager.

The reconciled design combines the strongest parts of the two studies:

- Strong product simplicity and MVP discipline.
- Clear urgency-based dashboard.
- Manual renewal with preserved reminder history.
- Lead-time based reminder creation for fast UX.
- Exact backend scheduling through `alert_at`.
- Persistent notification state.
- Duplicate protection.
- Retry handling.
- Recovery after downtime.
- Minimal architecture with no unnecessary infrastructure.

The reliability mechanisms are not extra product features. They are what make the core product promise trustworthy.

---

# 2. Problem Statement

People frequently lose money, time, or convenience because they forget upcoming deadlines:

- Car insurance renewal.
- Subscription renewal.
- Domain expiration.
- Passport expiration.
- Hosting plan renewal.
- Membership expiration.
- Bills or administrative deadlines.

The information usually lives across email, memory, notes, or calendars.

The application solves one very specific problem:

> **"This thing needs my attention before this date, and I do not want to remember it myself."**

The product should reduce mental load rather than create another tool the user must constantly check.

---

# 3. Product Promise

The complete MVP workflow is:

```text
Add reminder
     ↓
Forget about remembering it
     ↓
Receive an email
     ↓
Take action
     ↓
Mark done or renew
```

Everything in the MVP must directly support this loop.

---

# 4. MVP Goals

The MVP should satisfy the following goals:

1. A user can add a reminder in less than approximately 15 seconds.
2. A user can understand reminder urgency immediately without manually reading and comparing dates.
3. A user receives an email even if they never open the application.
4. No reminder silently passes its scheduled alert without the system attempting notification.
5. One reminder cycle produces exactly one intended email notification.
6. Notification failures can be retried.
7. Server downtime must not permanently lose a notification.
8. Duplicate scheduler executions must not produce duplicate logical notifications.
9. A reminder can be marked done.
10. A reminder can be renewed without recreating everything manually.
11. Previous renewal cycles should remain historically traceable.
12. The product remains intentionally small and easy to understand.

---

# 5. Non-Goals for MVP

The following features are explicitly outside the MVP:

- Financial tracking.
- Expense management.
- Budgeting.
- Spending analytics.
- Automatic subscription detection.
- Bank integrations.
- AI functionality.
- OCR.
- Invoice storage.
- Attachments.
- SMS notifications.
- Push notifications.
- WhatsApp notifications.
- Native Android application.
- Native iOS application.
- Google Calendar integration.
- Outlook Calendar integration.
- Automatic recurrence.
- Multiple alert schedules per reminder.
- Shared reminders.
- Team reminders.
- Family accounts.
- Categories.
- Tags.
- Advanced search.
- Advanced filters.
- Analytics dashboard.
- Payment processing.
- Vendor integrations.
- Recommendation engines.
- CSV import/export.
- Complex user/account management.
- Microservices.
- Kafka.
- RabbitMQ.
- Redis.
- Kubernetes.
- Dedicated distributed job infrastructure.

The MVP should feel intentionally small.

---

# 6. Core User Stories

## 6.1 Add Reminder

As a user, I want to add a reminder with:

- Name.
- End date.
- Reminder lead time.
- Alert time.

so that I do not need to calculate or remember the alert date manually.

---

## 6.2 View Dashboard

As a user, I want all active reminders displayed according to urgency so that I immediately know what requires attention.

---

## 6.3 Receive Email

As a user, I want to receive an email when a reminder reaches its scheduled alert time even if I have not opened the application.

---

## 6.4 Mark Done

As a user, I want to mark a reminder as done so that it no longer appears in the active reminder list.

---

## 6.5 Renew

As a user, I want to renew an existing reminder for another cycle without recreating the reminder manually.

---

## 6.6 Edit

As a user, I want to edit a reminder when I entered an incorrect date, time, or name.

---

## 6.7 Empty State

As a new user, I want a clear empty state that immediately tells me what I should do first.

---

# 7. Reminder Creation Model

The user should not normally enter an absolute notification date manually.

Instead, the application should ask for:

```text
Name
End date
Remind me X days before
Alert time
```

Example:

```text
Name:
Car Insurance

End date:
20 October 2026

Remind me:
7 days before

At:
09:00
```

The application calculates the exact notification instant internally.

For example:

```text
end_date:
2026-10-20

alert_lead_days:
7

alert_time:
09:00

timezone:
Africa/Casablanca
```

becomes:

```text
alert_at:
2026-10-13T09:00
```

This creates a useful separation:

- **User-facing model:** simple lead time.
- **Backend model:** exact scheduled notification time.

---

# 8. Lead-Time Options

The MVP can provide a small preset list:

```text
1 day before
3 days before
7 days before
14 days before
30 days before
Custom
```

The exact UI may use a dropdown or selection control.

The important rule is:

> The user should not need to manually calculate the notification date.

---

# 9. Dashboard Urgency Model

Urgency is derived dynamically from the reminder's end date.

Urgency must not be stored as the reminder's lifecycle status.

## 9.1 Urgency States

| Urgency | Condition |
|---|---|
| Overdue | Today is after the end date |
| Urgent | End date is within 3 days |
| Soon | End date is within 14 days |
| Safe | End date is more than 14 days away |

---

# 10. Dashboard Ordering

The dashboard ordering should be:

```text
OVERDUE
   ↓
URGENT
   ↓
SOON
   ↓
SAFE
```

Within each group:

```text
earliest end date first
```

This ensures the most important reminder is always visually closest to the top.

---

# 11. Color and Accessibility

Suggested visual treatment:

- Overdue: dark red / clearly distinct.
- Urgent: red.
- Soon: orange.
- Safe: green.
- Done or archived: neutral/grey if shown in history.

However, urgency should never be communicated through color alone.

Prefer:

```text
🔴 URGENT — 2 days left
```

instead of merely changing the background color.

---

# 12. Reminder Lifecycle Status

Reminder lifecycle status is separate from urgency.

The MVP lifecycle statuses are:

```text
ACTIVE
DONE
ARCHIVED
```

Examples:

```text
status = ACTIVE
urgency = SAFE
```

or:

```text
status = ACTIVE
urgency = OVERDUE
```

Urgency is calculated.

Status is stored.

---

# 13. Why Overdue Is P0

Overdue should be part of the MVP, not a later enhancement.

Without an overdue state, users cannot distinguish:

```text
Expires tomorrow
```

from:

```text
Expired yesterday
```

The implementation cost is extremely small because it is derived from:

```text
today > end_date
```

Therefore:

> **Overdue is a P0 MVP requirement.**

---

# 14. Why Edit Is P0

Users will make mistakes.

For example:

```text
20/10/2026
```

instead of:

```text
20/11/2026
```

Without edit, users would need to delete and recreate reminders.

Therefore:

> **Edit is a P0 MVP capability.**

Delete is not required for P0 because incorrect reminders can be edited, and valid reminders can be marked done.

---

# 15. Main Dashboard Card

A reminder card should answer four questions immediately:

1. What is it?
2. When does it expire?
3. How much time remains?
4. When will I be notified?

Example:

```text
🔴 URGENT

Car Insurance

Expires
20 October 2026

2 days remaining

Email scheduled
18 October · 09:00

                      ⋯
```

The action menu can contain:

```text
Edit
Renew
Mark done
```

No complex action bar is necessary.

---

# 16. Empty State

The empty dashboard should not simply say:

```text
No reminders.
```

A better empty state is:

```text
Nothing to remember yet.

Add your first payment or expiry date
and we'll remind you before it's due.

+ Add Reminder
```

The goal is to immediately teach the product through the empty state.

---

# 17. Add Reminder Form

The form should remain intentionally short:

```text
Add Reminder

Name
[ Car Insurance ]

End date
[ 20 / 10 / 2026 ]

Remind me
[ 7 days before ▼ ]

At
[ 09:00 ]

Cancel              Add Reminder
```

Do not add:

- Description.
- Category.
- Vendor.
- Price.
- Currency.
- Payment method.
- Attachments.
- Notes.
- Recurrence configuration.
- Multiple alert rules.

---

# 18. Notification Policy

The MVP should follow one critical rule:

> **One reminder cycle generates exactly one scheduled email notification.**

Example:

```text
Car Insurance
End date: 20 October
Reminder: 7 days before
```

produces:

```text
13 October
09:00

ONE EMAIL
```

The system does **not** resend the reminder every day until completion.

This avoids turning a reminder into an unwanted daily nagging system.

---

# 19. Why Daily Nagging Is Rejected

A daily threshold implementation such as:

```text
if days_until_due <= alert_lead_days:
    send_email()
```

could produce many emails.

For a 14-day lead time:

```text
Day -14
Day -13
Day -12
...
Day 0
```

The user could receive up to 15 emails for one reminder.

That is inconsistent with the simple MVP promise.

Therefore:

> One reminder cycle = one scheduled notification.

---

# 20. Notification Recovery

The scheduler must not depend on executing at the exact scheduled second.

Bad logic:

```text
alert_at == now
```

Correct conceptual logic:

```text
alert_at <= now
AND notification has not been successfully processed
```

Example:

```text
Alert scheduled:
09:00

Server offline:
08:55 → 10:30
```

At 10:30 the system should discover that the notification is overdue and still process it.

Late is better than permanently missed.

---

# 21. Why `last_notified_on` Is Not Enough

A single field such as:

```text
last_notified_on
```

is not sufficiently strong for notification reliability.

Potential failure:

```text
1. Worker sends email.
2. Email provider accepts it.
3. Application crashes.
4. last_notified_on was never saved.
5. Server restarts.
6. Email is sent again.
```

Another possible race:

```text
Worker A                Worker B
--------                --------
read unsent             read unsent
send                    send
```

Both workers can act before the field is updated.

Therefore the notification state deserves its own persistent record.

---

# 22. Notification Ledger

The MVP should use a `notifications` table.

Conceptual structure:

```text
notifications

id
reminder_id
scheduled_for
channel
status
attempt_count
provider_message_id
last_error
sent_at
created_at
updated_at
```

Channel for MVP:

```text
EMAIL
```

Statuses:

```text
PENDING
PROCESSING
SENT
FAILED
CANCELLED
```

`CANCELLED` covers a notification that will never be sent because the world changed underneath it before it was claimed: the reminder was marked done, or the reminder was edited and this scheduled occurrence no longer applies. Without this state, a superseded notification would sit in the table permanently labeled `PENDING`, which is both factually wrong and pollutes any later query like "how many notifications are waiting to go out."

---

# 23. Notification Uniqueness

Add a database-level uniqueness constraint:

```text
UNIQUE (
    reminder_id,
    scheduled_for,
    channel
)
```

This ensures only one logical notification exists for a reminder occurrence.

The database therefore becomes part of the duplicate-protection mechanism.

---

# 24. Notification State Machine

The notification lifecycle is:

```text
Reminder becomes due
        ↓
Create / claim notification
        ↓
      PENDING ──────────────┐
        ↓                   │
    PROCESSING          reminder marked done
       /    \            or edited before
      /      \            this row is claimed
 success    failure            │
    ↓          ↓                ↓
  SENT       FAILED         CANCELLED
               ↓
             retry
```

`CANCELLED` is only reachable from `PENDING`, before the processor has claimed the row. Once a notification is `PROCESSING`, it runs to `SENT` or `FAILED` — the in-flight send is not interrupted, since the reminder status check already happens before the send is attempted (§43.4).

The persisted state allows the system to survive:

- Restarts.
- Temporary email provider errors.
- Scheduler retries.
- Duplicate scheduler invocations.

---

# 25. Retry Policy

When the email provider fails temporarily:

```text
status = FAILED
attempt_count += 1
```

The notification should be retried later.

Recommended MVP limit:

```text
maximum automatic attempts = 5
```

The exact retry intervals can be simple.

No distributed queue platform is required.

---

# 26. Email Definition of "Sent"

For P0:

```text
SENT
```

should mean:

> The transactional email provider accepted the email send request successfully.

Actual mailbox delivery, bounce processing, and webhook-based delivery tracking are useful operational enhancements but are not required for the first MVP.

---

# 27. Email Content

Email should remain very small.

Example:

```text
Subject:
Car insurance expires in 7 days

Car Insurance is due on
20 October 2026.

7 days remaining.

Open Never Miss It
```

Minimum information:

- Reminder name.
- End date.
- Remaining time.
- Link back to dashboard.

No newsletter styling.
No marketing copy.
No AI-generated content.

---

# 28. Renewal Model

Renewal should create a **new reminder cycle**, rather than destroying the previous one.

Example:

```text
Car Insurance 2026
       ↓ renew
Car Insurance 2027
       ↓ renew
Car Insurance 2028
```

This preserves historical cycles naturally.

---

# 29. Renewal Workflow

Existing reminder:

```text
Car Insurance

End date:
20 October 2026

Lead time:
7 days

Alert time:
09:00

Status:
ACTIVE
```

The user clicks:

```text
Renew
```

The renewal dialog asks primarily for:

```text
New end date:
20 October 2027
```

The existing alert configuration can be pre-filled:

```text
7 days before
09:00
```

After confirmation:

Old reminder:

```text
status = ARCHIVED
```

New reminder:

```text
status = ACTIVE
parent_reminder_id = previous reminder id
```

This makes renewal fast while retaining historical information.

---

# 30. Parent Reminder Relationship

Each renewed reminder can contain:

```text
parent_reminder_id
```

This produces a lightweight historical chain:

```text
2026 reminder
   ↓
2027 reminder
   ↓
2028 reminder
```

No separate reminder-history subsystem is required.

---

# 31. Authentication Decision

For the first functional MVP, avoid building a complete multi-user account system.

Recommended product mode:

> **Single-owner application with protected access.**

Do not initially build:

- Public signup.
- Email verification.
- Password reset.
- Organizations.
- Team access.
- User administration.
- Complex permissions.

The deployed application must still not expose private reminders publicly.

If the product later becomes a public multi-user service, authentication and user ownership should become a separate milestone.

---

# 32. Timezone Model

Timezone handling is important even for a small reminder system.

Two concepts must remain separate:

## End Date

```text
DATE
```

Example:

```text
2026-10-20
```

The end date is a calendar date.

## Alert Time

The actual notification moment is an instant:

```text
TIMESTAMPTZ
```

Example:

```text
2026-10-13T09:00 Africa/Casablanca
```

The application should store the user's timezone explicitly.

Example:

```text
Africa/Casablanca
```

---

# 33. Proposed Data Model

## 33.1 `reminders`

```text
id                  uuid, primary key

name                text

end_date            date

alert_lead_days     integer

alert_time          time

alert_at            timestamptz

status              active | done | archived

parent_reminder_id  uuid nullable
                    fk -> reminders.id

completed_at        timestamptz nullable

created_at          timestamptz

updated_at          timestamptz
```

---

## 33.2 `notifications`

```text
id                   uuid, primary key

reminder_id          uuid
                     fk -> reminders.id

scheduled_for        timestamptz

channel              email

status               pending
                     processing
                     sent
                     failed
                     cancelled

attempt_count        integer

provider_message_id  text nullable

last_error           text nullable

sent_at              timestamptz nullable

created_at           timestamptz

updated_at           timestamptz
```

Constraint:

```text
UNIQUE (
    reminder_id,
    scheduled_for,
    channel
)
```

---

## 33.3 `settings`

```text
notification_email
timezone
```

The MVP does not need a complex preferences model.

---

# 34. Recommended Architecture

The system should remain a simple monolithic application plus a lightweight notification processor.

```text
                         USER
                          │
                          ▼
                 ┌─────────────────┐
                 │     Next.js     │
                 │                 │
                 │ Dashboard       │
                 │ Add / Edit      │
                 │ Done / Renew    │
                 │ Settings        │
                 └────────┬────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │ Reminder Domain │
                 │                 │
                 │ ReminderService │
                 │ UrgencyService  │
                 └────────┬────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │   PostgreSQL    │
                 │                 │
                 │ reminders       │
                 │ notifications   │
                 │ settings        │
                 └────────┬────────┘
                          ▲
                          │
                 ┌────────┴────────┐
                 │ Notification    │
                 │ Processor       │
                 │                 │
                 │ find due        │
                 │ claim           │
                 │ send            │
                 │ retry           │
                 └────────┬────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │ Email Provider  │
                 │                 │
                 │ Resend Adapter  │
                 └─────────────────┘
```

---

# 35. Recommended Technical Stack

Suggested MVP stack:

```text
Frontend + backend:
Next.js

Language:
TypeScript

Database:
PostgreSQL

ORM:
Prisma

Validation:
Zod

Email:
Provider abstraction
with Resend adapter

Testing:
Vitest
Playwright

Local development:
Docker Compose

Repository:
Single repository
```

The objective is to keep the system easy to run and easy to reason about.

---

## 35.1 Hosting & Deployment Platform Decision

This decision was previously implicit. It needs to be explicit because it directly constrains §37 (Scheduler Frequency).

**The constraint:** the notification processor needs to run every few minutes, not once a day, once `alert_time` supports specific times like `09:00` or `14:00`. If the app is deployed on Vercel, this collides with a real platform limit: Vercel's free Hobby tier runs cron jobs at most once per day, rejects any more-frequent schedule at deploy time, and only guarantees the single daily run lands somewhere within the scheduled hour, not at an exact minute. Sub-daily, minute-precise cron requires the Pro plan, which is a recurring $20/month/user cost.

**Options, in order of preference for a solo/personal MVP:**

| Option | Frequency achievable | Cost | Trade-off |
|---|---|---|---|
| **GitHub Actions scheduled workflow** calling the protected `/api/internal/process-due-notifications` endpoint | Every 5–15 min (best-effort, not minute-precise) | Free | Slight timing drift, but the recovery model in §20 already treats "late" as acceptable — this is consistent with that design, not a workaround for it |
| **Small always-on worker** (Railway/Render/Fly.io free-to-cheap tier) running its own interval loop | Any interval, precise | ~$0–5/mo | One more service to deploy, but removes dependency on any vendor's cron product entirely — most aligned with §36's principle that business logic shouldn't depend on a specific scheduler |
| **Vercel Pro** | Per-minute, precise | $20/mo/user | Simplest if already committed to Vercel for hosting, but a recurring cost that sits awkwardly next to the "minimal infrastructure" principle (§52, #6) |

**Recommendation:** GitHub Actions scheduled workflow for MVP. It's free, requires no new hosting relationship, and the imprecision it introduces (a few minutes of drift) is already something the architecture is designed to tolerate. Revisit if/when notification timing precision becomes a real product requirement rather than a nice-to-have.

---

# 36. Scheduler / Notification Processor

The notification processing logic should be encapsulated behind one operation:

```text
processDueNotifications()
```

Conceptual responsibilities:

```text
Find due reminders
       ↓
Create or claim notification
       ↓
Attempt send
       ↓
Persist outcome
       ↓
Retry failures when applicable
```

The business logic should not depend directly on Vercel Cron or a specific scheduler provider.

A hosted cron, dedicated Node worker, or other scheduler can trigger the same application function.

---

# 37. Scheduler Frequency

A once-daily scheduler is too restrictive if the reminder form supports:

```text
09:00
14:00
18:30
```

Therefore the processor should run periodically, for example every few minutes. See §35.1 for the hosting decision this requires — a once-daily cron on a free Vercel deployment cannot satisfy this, so the trigger mechanism (GitHub Actions, an always-on worker, or a paid cron tier) must be chosen deliberately rather than assumed.

Conceptual database query:

```text
status = ACTIVE
AND alert_at <= NOW()
AND notification not successfully sent
```

With proper indexes, this remains trivial for MVP scale.

---

# 38. No Dedicated Queue Infrastructure

The reliability model does **not** require:

```text
Redis
BullMQ
RabbitMQ
Kafka
Celery
Temporal
```

PostgreSQL is enough for MVP-scale coordination and persistence.

---

# 39. API Design

Minimal API surface:

```text
POST   /api/reminders
GET    /api/reminders
GET    /api/reminders/:id
PATCH  /api/reminders/:id

POST   /api/reminders/:id/done
POST   /api/reminders/:id/renew

GET    /api/settings
PATCH  /api/settings

GET    /api/health
```

A scheduler-specific internal endpoint may exist depending on deployment:

```text
POST /api/internal/process-due-notifications
```

It should be protected appropriately and must call the same domain operation used by any worker process.

---

# 40. Business Logic Boundaries

Avoid placing domain logic directly inside API routes.

Preferred structure:

```text
HTTP Route
    ↓
Service
    ↓
Repository
    ↓
Database
```

Suggested services:

```text
ReminderService
UrgencyService
NotificationService
EmailService
SettingsService
```

Each service should have one clear responsibility.

---

# 41. Suggested Repository Structure

```text
never-miss-it/
│
├── src/
│   │
│   ├── app/
│   │   ├── page.tsx
│   │   ├── api/
│   │   └── ...
│   │
│   ├── components/
│   │   ├── ReminderCard.tsx
│   │   ├── ReminderForm.tsx
│   │   ├── UrgencyBadge.tsx
│   │   └── ...
│   │
│   ├── server/
│   │   ├── reminders/
│   │   ├── notifications/
│   │   ├── email/
│   │   ├── settings/
│   │   └── db/
│   │
│   ├── worker/
│   │   └── notification-processor.ts
│   │
│   └── shared/
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── tests/
│
├── docker-compose.yml
│
└── package.json
```

No monorepo is required.

---

# 42. Validation Rules

## Reminder Name

- Required.
- Trimmed.
- Cannot be blank.
- Reasonable maximum length.

## End Date

- Required.

## Alert Lead Time

- Required.
- Must be valid.
- Cannot produce a nonsensical alert configuration.

## Alert Time

- Required.

The backend must enforce validation even if the frontend also validates inputs.

---

# 43. Important Edge Cases

## 43.1 Server Offline During Alert

```text
Alert due at 09:00
Server restarts at 10:30
```

Expected:

```text
Notification still processed.
```

---

## 43.2 Worker Executes Twice

Expected:

```text
Exactly one logical notification.
```

---

## 43.3 Provider Failure

Expected:

```text
FAILED
↓
retry
↓
SENT
```

---

## 43.4 Mark Done Before Alert

If the user marks a reminder done before its scheduled alert:

```text
No notification should be sent.
```

Concrete rule: marking a reminder done immediately sets any of its `PENDING` notification rows to `CANCELLED`. This is a belt-and-suspenders design — the processor also re-checks the current reminder status before sending, so even a notification that was claimed (`PROCESSING`) in the narrow window before cancellation still won't send. But cancelling at mark-done time keeps the notifications table accurate without waiting for the next processor sweep.

---

## 43.5 Reminder Becomes Overdue

Do not automatically complete or archive it.

Expected:

```text
status = ACTIVE
urgency = OVERDUE
```

It remains visible until the user acts.

---

## 43.6 User Edits Reminder Before Notification

The scheduled notification should reflect the new valid configuration.

The implementation must ensure stale notification scheduling data is invalidated or updated safely.

Concrete rule: if an edit changes `end_date`, `alert_lead_days`, or `alert_time` on a reminder with status `ACTIVE`, cancel any `PENDING` notification row for that reminder (set it to `CANCELLED`, do not delete it — it stays as a historical record of a superseded schedule). Do not touch rows already `SENT`, `FAILED`, or `PROCESSING`. The next processor sweep will find the reminder's newly computed `alert_at` has no matching notification yet and create a fresh `PENDING` row for it — the unique constraint in §23 guarantees this can't collide with anything left over from before the edit.

---

## 43.7 Renewal

The previous reminder becomes archived.

A new active reminder is created.

The new cycle receives its own new notification occurrence.

---

# 44. Error Isolation

One failed reminder must not stop the rest of the notification batch.

Example:

```text
Reminder A → SENT
Reminder B → FAILED
Reminder C → SENT
```

B is retried later.

A and C remain successful.

---

# 45. MVP Test Matrix

## Scheduling

```text
Given alert is tomorrow
→ no email
```

```text
Given alert is due now
→ email attempted
```

```text
Given alert was due while server was offline
→ email attempted after restart
```

---

## Idempotency

```text
Processor runs twice
→ one logical notification
```

---

## Completion

```text
Reminder due tomorrow
User marks DONE today
→ no email tomorrow
→ any PENDING notification for it becomes CANCELLED
```

---

## Cancellation on Edit

```text
Reminder has a PENDING notification scheduled
User edits end_date, lead time, or alert time
→ the old PENDING notification becomes CANCELLED
→ a new PENDING notification is created for the new alert_at
→ exactly one notification is ever sent for the reminder's current configuration
```

---

## Renewal

```text
Old cycle notification already sent
User renews reminder
New alert becomes due
→ new notification sent once
```

---

## Retry

```text
Email provider fails
→ notification FAILED

Provider recovers
→ retry succeeds
→ notification SENT
```

---

## Urgency

Verify boundary cases:

```text
today > end date
→ OVERDUE
```

```text
3 days remaining
→ URGENT
```

```text
4 days remaining
→ SOON
```

```text
14 days remaining
→ SOON
```

```text
15 days remaining
→ SAFE
```

---

# 46. End-to-End Acceptance Scenario

A complete product acceptance test:

```text
Open application

        ↓

Click + Add Reminder

        ↓

Name:
Car Insurance

End date:
25 August

Remind me:
5 days before

At:
09:00

        ↓

Save

        ↓

Reminder appears
with correct urgency

        ↓

System calculates:
20 August · 09:00

        ↓

Clock passes
20 August · 09:00

        ↓

Email provider accepts one message

        ↓

Dashboard still shows reminder

        ↓

User clicks Renew

        ↓

New end date:
25 August next cycle

        ↓

Old reminder becomes archived

        ↓

New active reminder is created

        ↓

New notification schedule exists
for the new cycle
```

If this scenario works reliably, the core MVP exists.

---

# 47. Product Success Criteria

The MVP is considered functionally complete when:

- Reminder creation works.
- End date persists correctly.
- Lead time persists correctly.
- Alert time persists correctly.
- `alert_at` is calculated correctly.
- Reminder appears immediately on dashboard.
- Urgency is calculated correctly.
- Dashboard ordering is correct.
- Edit works.
- Mark done works.
- Renewal works.
- Previous cycle is archived.
- Renewal history is preserved.
- One notification per cycle is enforced.
- Missed notifications survive downtime.
- Temporary email failures can be retried.
- Duplicate scheduler execution does not create duplicate logical notifications.
- Marking a reminder done or editing it before its notification fires correctly cancels the stale notification instead of leaving it `PENDING`.
- The notification processor's trigger mechanism (§35.1) runs frequently enough to honor a user-selected `alert_time`, not just once a day.
- Timezone handling is correct.
- Overdue reminders remain visible.
- Empty state is clear.
- Desktop and mobile-width layouts are usable.
- The complete end-to-end flow works.

---

# 48. Product Metrics

Useful early metrics include:

## Leading Metrics

- Percentage of first-time users who add at least one reminder.
- Time from first opening the app to first reminder created.
- Notification provider acceptance rate.

## Lagging Metrics

- Percentage of reminders resolved before becoming overdue.
- Percentage of reminders renewed.
- User return rate after several weeks.

These metrics should be defined conceptually, but an analytics dashboard should **not** be built for MVP.

Early evaluation can be manual.

---

# 49. Suggested Development Sequence

This is not yet the detailed implementation plan, but the recommended vertical order is:

```text
Foundation
    ↓
Database schema
    ↓
Reminder CRUD
    ↓
Dashboard
    ↓
Urgency logic
    ↓
Add/Edit reminder UX
    ↓
Notification persistence
    ↓
Notification processor
    ↓
Email provider integration
    ↓
Retry + duplicate protection
    ↓
Done
    ↓
Renew + archive chain
    ↓
Timezone verification
    ↓
End-to-end tests
    ↓
Deployment hardening
```

The goal is to create working vertical slices instead of building a large amount of infrastructure before any visible feature works.

---

# 50. Final MVP Scope Matrix

| Capability | MVP |
|---|---:|
| Add reminder | ✅ |
| End date | ✅ |
| Lead time | ✅ |
| Alert time | ✅ |
| Exact backend `alert_at` | ✅ |
| Dashboard | ✅ |
| Safe / Soon / Urgent / Overdue | ✅ |
| Edit | ✅ |
| One email per cycle | ✅ |
| Missed-alert recovery | ✅ |
| Retry failed notification | ✅ |
| Duplicate protection | ✅ |
| Notification cancellation on done/edit | ✅ |
| Explicit hosting decision for processor cadence | ✅ |
| Mark done | ✅ |
| Renew | ✅ |
| Archive previous cycle | ✅ |
| Preserve renewal chain | ✅ |
| Notification email setting | ✅ |
| Timezone | ✅ |
| Empty state | ✅ |
| Public signup | ❌ |
| Daily nag emails | ❌ |
| Multiple alerts | ❌ |
| Categories | ❌ |
| Search/filter | ❌ |
| Financial management | ❌ |
| Analytics dashboard | ❌ |
| SMS/push | ❌ |
| Calendar integrations | ❌ |
| Automatic recurrence | ❌ |
| Native mobile app | ❌ |
| AI | ❌ |

---

# 51. Final Product Definition

> **Never Miss It is a lightweight personal life-admin reminder application built around a single workflow: record an important payment or expiry deadline and receive one reliable email before it becomes due. A reminder contains a name, end date, reminder lead time, and alert time. The application converts these values into an exact notification time, stores the reminder persistently, and displays active reminders on a dashboard ordered by urgency: overdue, urgent, soon, and safe. When an alert becomes due, a persistent notification processor sends exactly one email for that reminder cycle, survives server downtime, prevents duplicate sends, and retries temporary delivery failures. The user can edit an incorrect reminder, mark it done, or renew it; renewal archives the previous cycle and creates a new active cycle while retaining the reminder's history. The MVP intentionally contains no financial tracking, categories, advanced recurrence, multiple alerts, SMS, push notifications, calendar synchronization, native mobile application, AI functionality, or analytics dashboard. Its purpose is deliberately narrow: add the thing once, forget about remembering it, and trust the application to notify you.**

---

# 52. Authoritative Design Principles

The project should remain guided by the following principles:

1. **Simplicity before feature count.**
2. **Reliability before sophistication.**
3. **One reminder cycle, one intended notification.**
4. **User-facing lead time, backend exact scheduling.**
5. **Persist important notification state.**
6. **Use PostgreSQL instead of introducing queue infrastructure prematurely.**
7. **Keep urgency derived and lifecycle status persisted.**
8. **Preserve renewal history through new reminder cycles.**
9. **Avoid scope creep aggressively.**
10. **Ship the complete reminder loop before expanding the product.**

---

# 53. Recommended Decision to Freeze

The authoritative MVP should combine:

- The simple product experience.
- Urgency-first dashboard design.
- Lead-time based reminder creation.
- Exact backend `alert_at`.
- Separate notification persistence.
- Retry support.
- Duplicate protection.
- A `CANCELLED` notification state for done/edit before send.
- A named hosting/trigger mechanism for the processor (GitHub Actions, by default — see §35.1).
- Manual renewal.
- Archived previous cycles.
- Minimal settings.
- Single-owner MVP.
- No finance, AI, categories, advanced recurrence, or multi-channel notification.

This provides the strongest balance between:

```text
Simple UX
+
Small scope
+
Reliable behavior
+
Clean technical foundation
```

and is the recommended baseline for the formal technical specification and implementation plan.
