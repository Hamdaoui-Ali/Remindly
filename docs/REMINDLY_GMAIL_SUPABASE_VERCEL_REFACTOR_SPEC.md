# Remindly Refactor Technical Specification
## Gmail API + Supabase + Vercel Architecture

**Document status:** Proposed implementation specification<br>
**Revision:** 2 — post-review hardening<br>
**Project:** Remindly  
**Prepared:** 2026-08-30  
**Last reviewed:** 2026-08-30<br>
**Target stack:** Next.js 16, React 19, TypeScript, Prisma 7, PostgreSQL/Supabase, Supabase Auth, Supabase Cron, Gmail API, Vercel  
**Source baseline:** `Remindly-main(1).zip`

---

# 1. Executive Summary

Remindly is currently implemented as a **private, single-owner Next.js application**. The current codebase has a strong notification-processing core, including durable notification rows, bounded processing, retry state, processing leases, recovery, and provider abstraction. However, the application is not yet structured as a public multi-user reminder service.

The target refactor will transform Remindly into a **multi-user, serverless-ready application** that:

- hosts the Next.js web application and API routes on **Vercel**;
- stores application data in **Supabase PostgreSQL**;
- uses **Supabase Auth** for user registration, authentication, email confirmation, password recovery, and session management;
- uses **Supabase Cron (`pg_cron`) + `pg_net`** to trigger due-reminder processing;
- uses a dedicated **Gmail account through the Gmail API** as the application email sender;
- sends reminder emails to the email address of the authenticated, verified Remindly user;
- uses the **Supabase Send Email Auth Hook** to route Supabase Auth emails through the same Gmail API provider, avoiding Supabase's default SMTP limitations;
- preserves the existing durable notification ledger and retry architecture where possible;
- enforces per-user ownership for every reminder operation;
- supports multiple reminder alerts per event, including day- and hour-based offsets;
- is designed to operate at `$0` for a low-volume, personal/non-commercial beta while all providers remain within their current free-tier limits and policies.

The `$0` objective is an operating target, not a permanent price or availability guarantee. Provider pricing, quotas, acceptable-use rules, OAuth verification requirements, project pausing, and account enforcement can change independently of Remindly. The architecture must therefore preserve a migration path to another host, database tier, scheduler, or transactional email provider.

The most important architectural rule is:

> **Remindly users do not connect their Gmail accounts.**
>
> Remindly owns one dedicated Gmail sender account. Supabase Auth establishes each user's identity and verified email address. When a reminder becomes due, Remindly sends from the dedicated application Gmail account **to the user's verified Supabase email address**.

Target email flow:

```text
User signs up with john@example.com
              |
              v
        Supabase Auth
              |
       Send Email Hook
              |
              v
      Vercel internal API
              |
              v
          Gmail API
              |
              v
  confirmation email to John
              |
              v
     John confirms account
              |
              v
     public.user_profiles
              |
       user creates reminder
              |
              v
     Reminder + Alert rows
              |
       Supabase Cron every minute
              |
              v
POST /api/internal/process-due-notifications
              |
              v
     Notification processor
              |
              v
          Gmail API
              |
              v
       john@example.com
```

---

# 2. Current-State Code Audit

## 2.1 Current technology

The uploaded repository is not a Python backend. The inspected version is a full-stack Next.js application.

| Layer | Current implementation |
|---|---|
| Web framework | Next.js 16.3.1 |
| UI | React 19.2.8 |
| Language | TypeScript |
| ORM | Prisma 7.9.1 |
| PostgreSQL driver | `@prisma/adapter-pg` + `pg` |
| Authentication | NextAuth 4 credentials provider |
| Password hashing | bcryptjs |
| Email | Resend |
| Database | PostgreSQL |
| Local notification scheduling | Node/TypeScript polling worker |
| Intended production trigger | GitHub Actions endpoint call |
| Validation | Zod |
| Tests | Vitest + Playwright |

## 2.2 Current single-owner architecture

`package.json` currently describes Remindly as:

```text
Private one-owner deadline reminders.
```

Authentication is implemented in:

```text
src/server/auth/config.ts
```

The user is accepted only when:

```text
email === OWNER_EMAIL
AND
bcrypt.compare(password, OWNER_PASSWORD_HASH)
```

The credentials are environment variables:

```env
OWNER_EMAIL=owner@example.com
OWNER_PASSWORD_HASH=...
```

There is no database-backed `User` model in `prisma/schema.prisma`.

The current Prisma models are:

```text
Reminder
Notification
Settings
```

`Settings` is explicitly a singleton. A PostgreSQL constraint restricts its primary key to:

```text
singleton
```

The current notification processor therefore uses:

```ts
to: settings.notificationEmail
```

This means every reminder in the application shares one destination address.

### Required change

The single-owner model must be replaced by a real user identity model where every reminder is owned by a specific Supabase user.

---

## 2.3 Current email abstraction

The existing email abstraction is valuable and should be retained conceptually.

Current interface:

```ts
export interface EmailProvider {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}
```

Current provider:

```text
src/server/email/resend-provider.ts
```

The current notification processor correctly receives an `EmailProvider` dependency instead of directly importing Resend throughout the business logic.

### Required change

Replace:

```text
ResendEmailProvider
```

with:

```text
GmailEmailProvider
```

but **do not assume Gmail has the same delivery semantics as Resend**. Resend supports a provider idempotency key. Gmail's `users.messages.send` endpoint does not expose an equivalent idempotency-key parameter.

This difference is addressed later in this specification.

---

## 2.4 Existing notification processor strengths

The following behavior should be preserved:

- durable `Notification` rows;
- statuses:
  - `PENDING`
  - `PROCESSING`
  - `SENT`
  - `FAILED`
  - `CANCELLED`;
- bounded batch processing;
- atomic claiming;
- five-attempt maximum;
- retry delays;
- 15-minute processing lease;
- lease recovery;
- reconciliation for missing notification records;
- per-notification failure isolation;
- provider message ID storage;
- no sensitive email content in operational logs.

This subsystem is already substantially more reliable than an in-memory timer-based implementation.

---

## 2.5 Current production scheduling defect

The README currently states that the GitHub workflow processes notifications every ten minutes.

However, the actual workflow:

```text
.github/workflows/process-due-notifications.yml
```

contains only:

```yaml
on:
  workflow_dispatch:
```

There is no `schedule:` event.

Therefore, in the uploaded source, GitHub Actions **does not automatically trigger reminder processing**.

The local worker masks this issue during development because:

```text
scripts/local-notification-worker.ts
```

polls the processor repeatedly.

### Required change

Production scheduling will move to Supabase Cron instead of GitHub Actions.

---

## 2.6 Current reminder model limitation

Current `Reminder` stores:

```text
endDate
alertLeadDays
alertTime
alertAt
```

This represents one alert schedule per reminder.

The desired Remindly behavior includes combinations such as:

```text
Interview at 2026-09-15 14:00
  - 7 days before
  - 3 days before
  - same day at 09:00
  - 2 hours before
```

The current schema cannot model this cleanly because:

1. `endDate` is a date without event time;
2. a reminder contains only one `alertAt`;
3. `alertLeadDays` cannot naturally express hours/minutes;
4. notification uniqueness is bound directly to `Reminder.alertAt`.

The refactor should correct this while the data model is already being changed for multi-user support.

---

# 3. Target Architecture

## 3.1 System diagram

```text
+-------------------------------------------------------------+
|                         VERCEL                              |
|                                                             |
|  Next.js 16                                                 |
|  - UI                                                       |
|  - authenticated API routes                                 |
|  - reminder services                                       |
|  - Gmail API adapter                                       |
|  - Supabase Auth Send Email Hook endpoint                  |
|  - due-notification processor endpoint                     |
|                                                             |
+---------------------------+---------------------------------+
                            |
                            | PostgreSQL / Auth
                            v
+-------------------------------------------------------------+
|                        SUPABASE                             |
|                                                             |
|  Supabase Auth                                              |
|  - signup                                                   |
|  - login                                                    |
|  - email confirmation                                       |
|  - password reset                                           |
|                                                             |
|  PostgreSQL                                                 |
|  - user_profiles                                            |
|  - reminders                                                |
|  - reminder_alerts                                          |
|  - notifications                                            |
|                                                             |
|  pg_cron + pg_net                                           |
|  - every minute -> Vercel notification processor           |
|                                                             |
|  Send Email Auth Hook                                       |
|  - signup/recovery/etc -> Vercel auth-email endpoint       |
|                                                             |
+---------------------------+---------------------------------+
                            |
                            | HTTP hook / cron call
                            v
+-------------------------------------------------------------+
|                       GMAIL API                             |
|                                                             |
| Dedicated Remindly Gmail account                            |
| OAuth 2.0 offline refresh token                             |
| Scope: gmail.send                                           |
|                                                             |
+---------------------------+---------------------------------+
                            |
                            v
                       User inbox
```

## 3.2 Responsibility boundaries

### Vercel

Responsible for:

- serving the Next.js application;
- SSR/session handling with Supabase Auth;
- request-level authorization;
- Prisma application queries;
- reminder CRUD;
- notification processing;
- Gmail OAuth token refresh;
- MIME generation;
- Gmail API sends;
- handling Supabase Send Email Auth Hook calls.

### Supabase

Responsible for:

- user identity;
- email/password authentication;
- session JWT issuance;
- PostgreSQL hosting;
- cron scheduling;
- Auth Send Email Hook invocation;
- durable application state.

### Gmail

Responsible for:

- originating transactional email from the dedicated application Gmail account;
- actual email transfer to recipients;
- storing sent messages in the sender mailbox;
- enforcing Gmail send and API quotas.

---

# 4. Architecture Decisions

## ADR-001 — Use one dedicated Gmail sender account

### Decision

Use one Gmail account owned by Remindly, for example:

```text
remindly.notifications@gmail.com
```

Actual address availability is outside this specification.

### Do not

Do not ask each Remindly user to authorize Gmail.

Do not send as the user's email address.

Do not store a Gmail token for every Remindly user.

### Result

Application email looks like:

```text
From: Remindly <remindly.notifications@gmail.com>
To: user@example.com
```

This keeps the Gmail OAuth user count effectively limited to the application-owned sender account.

---

## ADR-002 — Use only `gmail.send`

Google currently classifies:

```text
https://www.googleapis.com/auth/gmail.send
```

as a **sensitive** scope.

It is narrower than Gmail read/modify scopes.

Do not request:

```text
gmail.readonly
gmail.modify
gmail.metadata
https://mail.google.com/
```

unless a later requirement genuinely needs them.

### Reason

Read/metadata/modify Gmail scopes are classified as restricted scopes and can introduce substantially heavier verification/security requirements.

Remindly only needs to send messages.

---

## ADR-003 — Use Supabase Auth Send Email Hook for auth emails

Supabase's default SMTP service is not intended for production and only sends to project-team addresses unless custom SMTP is configured.

Instead, configure:

```text
Supabase Auth -> Send Email HTTP Hook
```

to call a Vercel endpoint:

```text
POST /api/internal/auth/send-email
```

The endpoint verifies the Supabase Standard Webhooks signature and sends the requested authentication email through `GmailEmailProvider`.

### Benefits

- no custom email domain is required;
- no Supabase SMTP provider is required;
- Gmail credentials exist in only one platform: Vercel;
- signup confirmation can remain enabled;
- password recovery remains supported;
- Supabase continues to own verification tokens and flows;
- Remindly does not need a second custom verification system.

---

## ADR-004 — Keep Prisma for application data

Prisma remains the application ORM.

Supabase is used as managed PostgreSQL, not as a replacement for Prisma business repositories.

Use Supabase's pooled serverless connection for Vercel runtime traffic and a migration/session connection for Prisma CLI operations.

---

## ADR-005 — Supabase Auth is the identity authority

Remove the owner-only NextAuth implementation.

User identity is obtained from the Supabase Auth session.

Every business operation receives the authenticated user ID from the server-side session, never from client-supplied `userId` request data.

---

## ADR-006 — Preserve notification ledger, but accept Gmail's at-least-once edge case

Resend exposes provider idempotency keys. Gmail `users.messages.send` does not.

Therefore Remindly can prevent:

- concurrent duplicate workers;
- duplicate database claims;
- normal application-level resend bugs;

but it cannot mathematically guarantee exactly-once delivery when this sequence happens:

```text
1. Gmail accepts message.
2. Network fails before Remindly receives HTTP response.
3. Remindly records unknown outcome.
4. Retry sends message again.
```

The system therefore has **at-least-once delivery semantics in ambiguous transport failures**.

A duplicate reminder is possible in this narrow failure mode.

Do not request restricted Gmail read scopes merely to attempt mailbox reconciliation in the MVP.

---

# 5. Target Authentication Design

## 5.1 Dependencies

Remove:

```text
next-auth
bcryptjs
```

Add:

```text
@supabase/supabase-js
@supabase/ssr
standardwebhooks
```

The Gmail runtime integration can use native `fetch` rather than the full `googleapis` package.

This minimizes serverless bundle size and cold-start overhead.

A Google helper package may optionally be added as a development-only dependency for the one-time OAuth bootstrap script.

---

## 5.2 Supabase clients

Create:

```text
src/lib/supabase/client.ts
src/lib/supabase/server.ts
src/lib/supabase/proxy.ts
src/lib/supabase/admin.ts
```

### Browser client

Uses:

```env
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

### Server client

Uses cookie-based SSR configuration.

Supabase currently recommends SSR clients with cookies and PKCE-compatible flows for frameworks such as Next.js.

### Admin client

Uses server-only `SUPABASE_SECRET_KEY` and is never cookie-backed or exposed to the browser. Its allowed operations are limited to deleting the already authenticated current user and explicit owner-run profile reconciliation. Business repositories must not use the admin client to bypass ownership checks.

---

## 5.3 Replace owner auth helper

Delete/retire:

```text
src/server/auth/config.ts
src/server/auth/require-owner.ts
src/server/auth/session-cookie.ts
src/auth.ts
src/middleware.ts
src/app/api/auth/[...nextauth]/route.ts
```

Create:

```text
src/server/auth/require-user.ts
```

Conceptual contract:

```ts
export interface AuthenticatedUser {
  id: string;
  email: string;
}

export async function requireUser(): Promise<AuthenticatedUser> {
  // create server Supabase client
  // call auth.getUser()
  // reject/redirect if missing
  // require non-empty email
  // return { id, email }
}
```

### Rule

Authorization-critical code must use a server-validated user object.

Never trust:

```ts
request.body.userId
searchParams.userId
formData.userId
```

as the current identity.

---

## 5.4 Next.js 16 Proxy

Next.js 16 renamed the Middleware convention to Proxy. Retire:

```text
src/middleware.ts
```

and create:

```text
src/proxy.ts
```

using the `proxy` export required by the installed Next.js documentation.

Proxy responsibilities:

- refresh auth cookies;
- redirect unauthenticated page requests to `/login`;
- allow public routes:
  - `/login`
  - `/register`
  - `/forgot-password`
  - `/auth/confirm`
  - `/api/health`
  - `/api/internal/process-due-notifications`
  - `/api/internal/auth/send-email`;
- do not perform slow application-data queries;
- do not treat Proxy as the final authorization layer.

API handlers and server actions must still call `requireUser()`.

Authorization checks must live close to the data source in server-only repository/service functions. Layout visibility and Proxy redirects are user-experience controls, not security boundaries.

---

## 5.5 Signup

Registration page:

```text
/register
```

Input:

```text
email
password
confirmPassword
optional displayName
```

Call:

```ts
supabase.auth.signUp({ email, password, options: { emailRedirectTo } })
```

Hosted Supabase projects can require email confirmation before first sign-in.

Keep email confirmation enabled.

Because the Send Email Auth Hook is enabled, Supabase will ask the Vercel hook to send the confirmation email through Gmail API instead of using default SMTP.

---

## 5.6 Auth confirmation route

Create:

```text
src/app/auth/confirm/route.ts
```

The route must follow Supabase's SSR confirmation pattern and exchange the token hash for a session.

Expected action-specific redirect, for example signup:

```text
/auth/confirm?token_hash=...&type=signup
```

After success:

```text
/
```

or an onboarding page.

---

## 5.7 Password recovery

Support:

```text
/forgot-password
/reset-password
```

The recovery email is also sent through the Supabase Send Email Hook -> Gmail API.

No password-reset token is created or stored by Remindly itself.

---

# 6. Supabase Auth Send Email Hook

## 6.1 Endpoint

Create:

```text
src/app/api/internal/auth/send-email/route.ts
```

This endpoint is intentionally reachable without a Supabase user JWT because Supabase itself calls it.

Security is provided by the hook signature.

---

## 6.2 Signature verification

Add:

```text
standardwebhooks
```

Environment:

```env
SUPABASE_SEND_EMAIL_HOOK_SECRET=v1,whsec_...
```

Normalize the dashboard-provided secret exactly once before constructing the verifier:

```ts
const webhookSecret = configuredSecret.replace(/^v1,whsec_/, '');
```

Reject startup/request configuration if the resulting secret is empty. Do not log the configured value, normalized value, raw body, or signature headers.

Processing sequence:

```text
request.text()
    |
    v
verify Standard Webhooks signature
    |
    v
Zod-parse payload
    |
    v
build auth email template
    |
    v
GmailEmailProvider.send()
    |
    v
return HTTP 200 {}
```

Never parse JSON before signature verification if the verification library expects the exact raw body.

Require the Standard Webhooks ID, timestamp, and signature headers expected by the library. Keep its timestamp-tolerance/replay protection enabled. Return a sanitized error contract; do not return verifier details to callers.

## 6.2.1 Five-second execution budget

Supabase HTTP Auth Hooks must complete within five seconds. The endpoint therefore has a stricter contract than the reminder processor.

The complete path includes:

```text
Vercel cold start
  + Standard Webhooks verification
  + optional Google token refresh
  + Gmail messages.send
  + response serialization
```

Requirements:

- enforce a total route deadline below five seconds;
- use shorter bounded timeouts for token refresh and Gmail send;
- abort outstanding fetches when the route deadline is reached;
- return Supabase's documented hook error shape on provider/configuration failure;
- never perform an in-request retry after an ambiguous Gmail send timeout;
- do not acknowledge success before Gmail returns a successful Message resource;
- test both a warm access-token path and a cold-start/token-refresh path.

Because Gmail has no idempotency key, an ambiguous hook timeout may still result in a delivered email even though Supabase reports failure. This limitation must be documented in the operational runbook.

Launch gate: if deployed cold-refresh measurements cannot reliably finish below the four-second application deadline, do not enable public signup with this Vercel hook path. Re-evaluate a lower-latency hook runtime or transactional email provider; do not hide the failure by increasing a timeout beyond Supabase's limit.

---

## 6.3 Hook payload

Important fields include:

```text
user.email
user.new_email
email_data.token
email_data.token_hash
email_data.token_new
email_data.token_hash_new
email_data.redirect_to
email_data.site_url
email_data.email_action_type
```

The implementation must use an explicit Zod schema.

Unknown action types must fail closed or use a clearly defined generic template; do not silently send malformed links.

---

## 6.4 Supported email actions

At minimum implement templates for:

- signup confirmation;
- password recovery;
- magic-link/OTP flow if enabled later;
- invite if admin invitations are enabled later;
- email change.

Email change requires special care. Supabase documents counterintuitive token/hash field mapping when Secure Email Change is enabled.

The implementation must follow the Supabase hook payload contract rather than inferring recipient/hash pairing from variable names.

Required mapping contract:

| `email_action_type` | Recipient | Token/hash source | Confirmation type |
|---|---|---|---|
| `signup` | `user.email` | `token` / `token_hash` | `signup` |
| `recovery` | `user.email` | `token` / `token_hash` | `recovery` |
| `magiclink` | `user.email` | `token` / `token_hash` | `magiclink` |
| `invite` | invited `user.email` | `token` / `token_hash` | `invite` |
| `email_change`, current address | `user.email` | `token` / `token_hash_new` | `email_change` |
| `email_change`, new address | `user.new_email` | `token_new` / `token_hash` | `email_change` |

When Secure Email Change is disabled and only one token pair is present, send one message to `user.new_email` using the token/hash combination present in the payload as defined by the current Supabase contract. Zod validation must model these action variants as a discriminated union rather than one object with loosely optional fields.

Before implementation, verify the table against the exact Supabase version active for the project. Contract tests must use captured redacted fixtures for each enabled action.

---

## 6.5 Auth email link generation

Prefer token-hash confirmation links compatible with the SSR route.

Conceptually:

```text
${APP_URL}/auth/confirm
  ?token_hash=${tokenHash}
  &type=${actionType}
  &next=${safeRedirect}
```

The confirmation route must pass the action-specific type to `supabase.auth.verifyOtp({ token_hash, type })`; it must not collapse all actions to `type=email`.

Only permit redirects back to known Remindly origins/paths.

Do not reflect arbitrary external `redirect_to` values into clickable links without allow-list validation.

---

# 7. User Data Model

## 7.1 Public user profile

Supabase Auth stores users in `auth.users`.

Do not expose or directly manage the entire Auth schema with Prisma.

Create an application-owned public model mirroring only necessary user attributes.

Recommended model:

```prisma
model UserProfile {
  id               String   @id @db.Uuid
  email            String   @unique
  emailVerifiedAt  DateTime? @map("email_verified_at") @db.Timestamptz(6)
  timezone         String   @default("UTC")
  defaultAlertTime String   @default("09:00") @map("default_alert_time")
  createdAt        DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt        DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  reminders Reminder[]

  @@map("user_profiles")
}
```

`id` is the Supabase Auth user UUID.

---

## 7.2 Profile synchronization

Use a Supabase database trigger to create `public.user_profiles` when a new `auth.users` row is created.

Supabase officially documents this pattern and warns that a broken trigger can block signups.

The trigger must therefore be versioned and integration-tested.

Conceptual SQL:

```sql
create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.user_profiles (
    id,
    email,
    email_verified_at,
    timezone,
    default_alert_time
  ) values (
    new.id,
    new.email,
    new.email_confirmed_at,
    'UTC',
    '09:00'
  );

  return new;
end;
$$;
```

Then:

```sql
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();
```

Add a corresponding update trigger to synchronize:

```text
email
email_confirmed_at
```

when Supabase changes them.

### Important

When using a `security definer` function, set an empty `search_path` and fully qualify relations.

## 7.3 User deletion and profile repair

Prisma does not manage Supabase's `auth` schema, so matching UUID values alone do not define the full user lifecycle.

The Supabase integration SQL must define one authoritative deletion policy:

```text
auth.users deletion
  -> delete public.user_profiles row
  -> cascade to reminders
  -> cascade to reminder_alerts
  -> cascade to notifications
```

Prefer a database foreign key from `public.user_profiles.id` to `auth.users.id` with `ON DELETE CASCADE` when supported by the active Supabase configuration. Otherwise, use a minimal, versioned Auth deletion trigger with equivalent behavior.

Add an idempotent reconciliation script that can:

- create a missing profile for an existing Auth user;
- update stale email verification metadata;
- report orphaned profiles without logging email addresses;
- run in dry-run mode before making repairs.

Account deletion is destructive and must require recent authentication/explicit confirmation in the product flow. The retention policy for sent notification metadata must be documented before public signup is enabled; the MVP policy is full cascade deletion with the account.

---

# 8. Reminder Data Model Refactor

## 8.1 Recommended new schema

The existing one-alert-per-reminder model should be replaced with three distinct concepts:

1. reminder/event;
2. alert schedule;
3. delivery notification.

### Reminder

```prisma
model Reminder {
  id               String         @id @default(uuid()) @db.Uuid
  userId           String         @map("user_id") @db.Uuid
  name             String
  dueAt            DateTime       @map("due_at") @db.Timestamptz(6)
  status           ReminderStatus @default(ACTIVE)
  parentReminderId String?        @map("parent_reminder_id") @db.Uuid
  completedAt      DateTime?      @map("completed_at") @db.Timestamptz(6)
  createdAt        DateTime       @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt        DateTime       @updatedAt @map("updated_at") @db.Timestamptz(6)

  user     UserProfile     @relation(fields: [userId], references: [id], onDelete: Cascade)
  parent   Reminder?       @relation("ReminderRenewals", fields: [parentReminderId], references: [id], onDelete: Restrict)
  renewals Reminder[]      @relation("ReminderRenewals")
  alerts   ReminderAlert[]

  @@index([userId, status, dueAt])
  @@index([parentReminderId])
  @@map("reminders")
}
```

### ReminderAlert

```prisma
model ReminderAlert {
  id              String              @id @default(uuid()) @db.Uuid
  reminderId      String              @map("reminder_id") @db.Uuid
  scheduledFor    DateTime            @map("scheduled_for") @db.Timestamptz(6)
  offsetMinutes   Int?                @map("offset_minutes")
  scheduleVersion Int                 @default(1) @map("schedule_version")
  channel         NotificationChannel @default(EMAIL)
  enabled         Boolean             @default(true)
  createdAt       DateTime            @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime            @updatedAt @map("updated_at") @db.Timestamptz(6)

  reminder      Reminder       @relation(fields: [reminderId], references: [id], onDelete: Cascade)
  notifications Notification[]

  @@index([reminderId, scheduledFor])
  @@unique([reminderId, scheduledFor, channel])
  @@map("reminder_alerts")
}
```

### Notification

```prisma
model Notification {
  id                  String              @id @default(uuid()) @db.Uuid
  reminderAlertId     String              @map("reminder_alert_id") @db.Uuid
  scheduledFor        DateTime            @map("scheduled_for") @db.Timestamptz(6)
  scheduleVersion     Int                 @map("schedule_version")
  channel             NotificationChannel @default(EMAIL)
  status              NotificationStatus  @default(PENDING)
  attemptCount        Int                 @default(0) @map("attempt_count")
  nextAttemptAt       DateTime?           @map("next_attempt_at") @db.Timestamptz(6)
  processingStartedAt DateTime?           @map("processing_started_at") @db.Timestamptz(6)
  idempotencyKey      String              @unique @map("idempotency_key")
  providerMessageId   String?             @map("provider_message_id")
  lastErrorCode       String?             @map("last_error_code")
  sentAt              DateTime?           @map("sent_at") @db.Timestamptz(6)
  createdAt           DateTime            @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt           DateTime            @updatedAt @map("updated_at") @db.Timestamptz(6)

  alert ReminderAlert @relation(fields: [reminderAlertId], references: [id], onDelete: Cascade)

  @@unique([reminderAlertId, scheduleVersion, channel])
  @@index([status, nextAttemptAt, scheduledFor])
  @@map("notifications")
}
```

### Operational ledgers

These models contain no recipient address, Auth token, subject, body, or reminder content.

```prisma
enum EmailPurpose {
  REMINDER
  AUTH
}

enum EmailAttemptOutcome {
  RESERVED
  ACCEPTED
  DEFINITE_FAILURE
  UNKNOWN_OUTCOME
}

model EmailSendAttempt {
  id                String              @id @default(uuid()) @db.Uuid
  purpose           EmailPurpose
  outcome           EmailAttemptOutcome @default(RESERVED)
  sanitizedCode     String?             @map("sanitized_code")
  providerMessageId String?             @map("provider_message_id")
  attemptedAt       DateTime            @default(now()) @map("attempted_at") @db.Timestamptz(6)
  completedAt       DateTime?           @map("completed_at") @db.Timestamptz(6)

  @@index([attemptedAt, purpose, outcome])
  @@map("email_send_attempts")
}

enum ProcessorRunStatus {
  RUNNING
  SUCCEEDED
  FAILED
}

model ProcessorRun {
  id                   String             @id @default(uuid()) @db.Uuid
  status               ProcessorRunStatus @default(RUNNING)
  claimed              Int                @default(0)
  sent                 Int                @default(0)
  failed               Int                @default(0)
  recovered            Int                @default(0)
  sanitizedFailureCode String?            @map("sanitized_failure_code")
  startedAt            DateTime           @default(now()) @map("started_at") @db.Timestamptz(6)
  completedAt          DateTime?          @map("completed_at") @db.Timestamptz(6)

  @@index([status, startedAt])
  @@map("processor_runs")
}
```

---

## 8.2 Multiple alert examples

Interview:

```text
dueAt = 2026-09-15T14:00:00+01:00
```

Alerts:

```text
7 days before  -> offsetMinutes = 10080
3 days before  -> offsetMinutes = 4320
1 day before   -> offsetMinutes = 1440
2 hours before -> offsetMinutes = 120
```

For a simple bill expiration that has no meaningful clock time, the UI can still ask for a due date and use the user's configured default event time.

---

## 8.3 Timezone rules

Store all actual schedule instants in PostgreSQL as:

```text
timestamptz
```

User preferences store an IANA timezone, for example:

```text
Africa/Casablanca
Europe/Paris
America/New_York
```

The UI may collect local date/time, but the server must convert it to an absolute instant before persistence.

Never store a timezone offset such as `+01:00` as the user's timezone because daylight-saving rules can change.

## 8.4 Alert rule authority and invariants

`scheduledFor` is the authoritative delivery instant used by the processor. `offsetMinutes`, when present, records the user-selected fixed-duration rule used to derive that instant.

MVP semantics are intentionally fixed-duration:

```text
scheduledFor = dueAt - offsetMinutes minutes
```

Therefore, `1 day before` means exactly 1,440 minutes before the absolute `dueAt` instant. If the product later promises calendar-local behavior such as “the previous local day at 09:00,” introduce an explicit rule model instead of overloading `offsetMinutes`.

Enforce these invariants in validation and, where Prisma cannot express them, in versioned PostgreSQL constraints:

- `offsetMinutes` is a positive integer when present;
- `scheduledFor < reminder.dueAt` for offset-based alerts;
- duplicate `(reminderId, scheduledFor, channel)` alerts are rejected;
- all timestamps are persisted as `timestamptz` absolute instants;
- changing the user's profile timezone does not silently move existing absolute schedules;
- changing `dueAt` recomputes enabled offset-based alerts in one transaction;
- custom absolute alerts remain fixed unless the user explicitly edits them.

Editing behavior:

1. Preserve all `SENT` notifications as immutable history.
2. Cancel obsolete `PENDING` or `FAILED` notifications.
3. Do not mutate a notification leased as `PROCESSING`; mark its alert revision obsolete and let lease-guarded processing cancel it before send.
4. Create new notification rows with new UUID/idempotency keys for the revised schedule.
5. Increment an alert revision/version so the processor can verify that a claimed notification still belongs to the current schedule.

Add an integer `scheduleVersion` to `ReminderAlert` and copy it to `Notification`. The processor sends only when notification and alert versions match. This makes edit/send races explicit rather than relying only on timestamp equality.

## 8.5 Recipient-at-send policy

Notifications do not snapshot the recipient email. At send time, the processor resolves the current `UserProfile.email` and requires a non-null `emailVerifiedAt`. An account email change therefore redirects future unsent reminders to the newly verified address. If the account is temporarily unverified, due notifications fail with a sanitized non-provider code and follow a bounded retry policy without calling Gmail.

---

# 9. Multi-User Authorization Rules

This is a mandatory security refactor.

Current repository methods are global:

```text
findById(id)
listActive()
update(id)
```

They must become user-scoped.

Examples:

```ts
findById(userId, reminderId)
findByIdWithNotifications(userId, reminderId)
listActive(userId)
update(userId, reminderId, patch)
complete(userId, reminderId)
renew(userId, reminderId)
```

Prisma filters must include user ownership:

```ts
where: {
  id: reminderId,
  userId,
}
```

or equivalent compound constraints.

### Never do

```ts
prisma.reminder.findUnique({ where: { id: reminderId } })
```

inside a user-facing operation and then assume ownership later.

### Security objective

User A must never be able to:

- read User B's reminder;
- update User B's reminder;
- mark User B's reminder done;
- renew User B's reminder;
- see User B's notification history;
- alter User B's timezone/preferences.

Add explicit integration tests for IDOR/horizontal privilege escalation.

---

# 10. User Settings Refactor

Delete the global singleton settings model.

Current:

```text
Settings(id = singleton)
```

Target:

```text
UserProfile
  timezone
  defaultAlertTime
  email
  emailVerifiedAt
```

A separate `UserPreference` table can be introduced later if preferences grow significantly.

### Notification recipient

Do not accept a free-form notification email in the normal settings page for the MVP.

Use the verified Supabase account email:

```text
userProfile.email
```

This prevents a logged-in user from turning Remindly into an arbitrary email-sending relay.

If a separate reminder destination is added later, it must have its own verification workflow.

---

# 11. Gmail API Integration

## 11.1 Google Cloud setup

Create a Google Cloud project dedicated to Remindly.

Required steps:

1. Create/select a Google Cloud project.
2. Enable **Gmail API**.
3. Configure OAuth consent/application audience.
4. Request only:

   ```text
   https://www.googleapis.com/auth/gmail.send
   ```

5. Create OAuth client credentials.
6. Authorize the dedicated Remindly Gmail sender account once with offline access.
7. Capture the refresh token.
8. Store client ID, client secret, refresh token, and sender address in Vercel secrets.

---

## 11.2 OAuth publishing status

This point is critical for unattended reminder delivery.

Google documents that an external OAuth app in **Testing** status receives refresh tokens that expire after seven days when scopes beyond basic identity are used.

Because `gmail.send` is a sensitive Gmail scope, do not leave the production sender authorization in Testing mode.

Before real deployment:

```text
OAuth app publishing status -> In Production / Published
```

A personal-use application with fewer than 100 OAuth users may not require full verification, but unverified-app warnings can remain. In this architecture, only the dedicated Remindly sender account grants Gmail access; Remindly end users do not grant Gmail OAuth permissions.

Re-check Google's current OAuth policy before a public/commercial launch.

---

## 11.3 Refresh-token lifecycle

The provider must assume refresh tokens can stop working.

Google documents reasons such as:

- user revokes access;
- token is unused for a long period;
- Gmail-scope token becomes invalid after certain password/security changes;
- refresh-token limits are exceeded;
- organization policy blocks the scope.

Do not assume the refresh token is permanent.

Operationally:

- use a dedicated Gmail account;
- enable strong account security and recovery options;
- avoid repeatedly generating new refresh tokens;
- implement a recognizable `oauth_invalid_grant` operational error.

---

# 12. Gmail Provider Implementation

## 12.1 New files

Create:

```text
src/server/email/gmail-provider.ts
src/server/email/gmail-oauth.ts
src/server/email/mime.ts
src/server/email/errors.ts
```

Remove after migration:

```text
src/server/email/resend-provider.ts
```

Keep provider-neutral interfaces where practical.

---

## 12.2 Environment variables

```env
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...
GMAIL_SENDER_EMAIL=remindly.notifications@gmail.com
GMAIL_SENDER_NAME=Remindly
```

Optional controls:

```env
GMAIL_TOTAL_DAILY_BUDGET=350
GMAIL_AUTH_RESERVE=50
GMAIL_REQUEST_TIMEOUT_MS=10000
GMAIL_AUTH_HOOK_TOTAL_TIMEOUT_MS=4000
```

The Auth Hook total timeout includes token refresh and Gmail send; individual fetch timeouts must be shorter than this total. The reminder processor may use the longer request timeout because it is not inside Supabase's five-second Auth transaction.

The sender budget leaves headroom below Gmail's standard account daily sending limit for:

- signup emails;
- password recovery;
- manual administrative sends;
- quota uncertainty.

---

## 12.3 Access-token refresh

Use native `fetch`:

```http
POST https://oauth2.googleapis.com/token
Content-Type: application/x-www-form-urlencoded
```

Payload:

```text
client_id=...
client_secret=...
refresh_token=...
grant_type=refresh_token
```

The OAuth helper should:

1. cache the access token in module scope;
2. cache its expiration timestamp;
3. refresh when fewer than ~60 seconds remain;
4. tolerate cold starts by re-fetching when cache is empty;
5. never log access or refresh tokens.

Vercel instances may be reused, but correctness must not depend on reuse.

---

## 12.4 MIME generation

Gmail API expects an RFC-compatible MIME message encoded as base64URL in the `raw` property.

Minimum headers:

```text
From
To
Subject
MIME-Version
Content-Type
```

Recommended multipart body:

```text
multipart/alternative
  text/plain
  text/html
```

Use CRLF line endings.

Node can encode the final MIME buffer using base64URL.

Example conceptual payload:

```ts
const raw = Buffer.from(mimeMessage, 'utf8').toString('base64url');

await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ raw }),
});
```

---

## 12.5 Header-injection protection

User-provided reminder names eventually appear in subjects and bodies.

Before constructing MIME headers:

- reject `\r` and `\n` in address/header values;
- limit subject length;
- validate destination email with Zod;
- HTML-escape all user-provided values;
- generate multipart boundaries internally;
- never let the user control `From`.

---

## 12.6 Gmail send endpoint

Use:

```http
POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send
```

On success, Gmail returns a Message resource containing an immutable message ID.

Store:

```text
providerMessageId = response.id
```

---

# 13. Gmail Error Classification

The existing provider abstraction uses:

```text
definite_failure
unknown_outcome
```

Expand this into operationally useful classes.

Recommended internal categories:

```ts
type EmailFailureKind =
  | 'permanent'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'auth_revoked'
  | 'unknown_outcome';
```

Suggested mapping:

| Condition | Classification | Retry? |
|---|---|---|
| MIME/client validation fails before HTTP request | permanent | No |
| Google token endpoint `invalid_grant` | auth_revoked | No automatic rapid retry |
| Gmail 400 due to invalid message | permanent | No |
| Gmail 401 after token refresh | auth_revoked/config | No rapid retry |
| Gmail 403 with documented quota/rate reason | rate_limited | Yes, delayed |
| Gmail 403 permission/scope/policy reason | permanent or auth_revoked/config | No rapid retry |
| Gmail 429 | rate_limited | Yes, exponential backoff |
| Gmail 5xx | unknown/provider unavailable | Yes |
| Network timeout after request was sent | unknown_outcome | Yes, duplicate possible |
| DNS/connect failure before request send | provider_unavailable | Yes |

Do not store the raw Google error payload in `lastError` if it may include sensitive data.

Store sanitized codes such as:

```text
gmail_429
gmail_5xx
gmail_auth_invalid_grant
gmail_unknown_transport
gmail_invalid_message
```

---

# 14. Delivery Semantics and Duplicate Risk

## 14.1 What the ledger guarantees

The database can guarantee that only one worker owns a notification lease at a time.

This protects against:

- overlapping cron invocations;
- two Vercel instances processing the same row concurrently;
- stale processor recovery;
- duplicate normal sends from application logic.

## 14.2 What Gmail cannot guarantee for Remindly

There is no Gmail request idempotency key equivalent to the Resend key currently used.

Therefore an ambiguous network failure may produce a duplicate on retry.

### Chosen policy

For reminder notifications, prefer **delivery over silent loss**.

On unknown outcome:

- record `FAILED` with sanitized error code;
- schedule bounded retry;
- retain the same notification UUID;
- accept the small duplicate risk;
- show in operational docs that Gmail mode is at-least-once under ambiguous failures.

Do not broaden Gmail scope to restricted read access solely to reconcile the Sent mailbox.

---

# 15. Reminder Email Composition

Recommended reminder email:

```text
From: Remindly <configured Gmail sender>
To: verified user email
Subject: Reminder: {name}
```

Content should include:

- reminder title;
- due date/time in user's timezone;
- human-readable time remaining;
- why the message was sent;
- link to the authenticated Remindly reminder page;
- simple footer explaining that the email was generated from a reminder the user created.

Do not include sensitive reminder content in URL query strings.

Prefer:

```text
https://remindly.vercel.app/reminders/{uuid}
```

The page itself requires authentication and ownership validation.

---

# 16. Notification Processor Refactor

## 16.1 Recipient resolution

Current:

```ts
settings.notificationEmail
```

Target relationship:

```text
Notification
  -> ReminderAlert
      -> Reminder
          -> UserProfile
              -> email
```

Repository query should load only the fields required for processing.

Conceptually:

```ts
include: {
  alert: {
    include: {
      reminder: {
        include: {
          user: true,
        },
      },
    },
  },
}
```

Send only if:

```text
user.email exists
AND user.emailVerifiedAt exists
AND reminder.status == ACTIVE
AND alert.enabled == true
AND notification.scheduleVersion == alert.scheduleVersion
AND notification.scheduledFor == alert.scheduledFor
```

The atomic claim query should filter by current reminder/alert eligibility before leasing rows. The post-claim checks remain mandatory to close the race between claiming and sending.

---

## 16.2 Batch size

Recommended initial production value:

```text
PROCESSOR_BATCH_LIMIT = 20
```

Reason:

- Gmail personal account limits are much lower than high-volume email APIs;
- sequential processing remains simple;
- Vercel execution stays bounded;
- cron runs every minute.

Set the route maximum duration explicitly, for example:

```ts
export const maxDuration = 60;
```

The current Vercel Hobby/Fluid Compute limits provide more headroom, but Remindly should remain intentionally bounded.

---

## 16.3 Retry policy

The existing retry pattern is reasonable:

```text
5 minutes
30 minutes
2 hours
12 hours
```

Add small random jitter to avoid synchronized retries.

Example:

```text
delay * random(0.9, 1.1)
```

Do not consume an attempt when the notification was not actually claimed/sent because the application-level daily Gmail budget was exhausted.

---

## 16.4 Global Gmail sending budget

Google documents a standard Gmail account daily send limit around 500 outgoing messages.

Do not run Remindly at the absolute limit.

Initial recommended total application limit:

```text
350 total Gmail API sends per rolling 24-hour window
```

This limit includes reminder emails and Supabase Auth emails. It leaves capacity for mailbox uncertainty and sends made outside Remindly.

Create a provider-neutral `EmailSendAttempt` ledger, or equivalent durable aggregate, that records sanitized metadata for every Gmail send path:

```text
purpose: REMINDER | AUTH
outcome: RESERVED | ACCEPTED | DEFINITE_FAILURE | UNKNOWN_OUTCOME
attemptedAt
providerMessageId (nullable)
```

Do not store recipient addresses, Auth tokens, subjects, or bodies in this budget ledger.

Retain these operational rows for 30 days, then delete them with a versioned maintenance job. The retention window is long enough for quota/debugging review while keeping the ledger bounded and non-user-facing.

Reserve capacity for Auth operations:

```text
TOTAL_DAILY_BUDGET = 350
AUTH_RESERVE = 50
REMINDER_CLAIM_CEILING = 300
```

Reminder processing stops claiming when either the reminder ceiling or total budget is exhausted. Auth sends may use the reserve but must fail closed when the total budget is exhausted. These are conservative application controls, not exact replicas of Gmail's mailbox quota calculation.

Budget check and reservation must be atomic across reminder workers and Auth Hook requests. Use a short PostgreSQL transaction with one shared advisory-lock key, or an equivalent serialized budget primitive:

```text
begin transaction
acquire Gmail-budget advisory transaction lock
count RESERVED + ACCEPTED + UNKNOWN_OUTCOME attempts in rolling window
validate total and per-purpose ceiling
for reminder processing: claim due notification rows and insert one RESERVED EmailSendAttempt per claim in the same transaction
for Auth: insert one RESERVED EmailSendAttempt
commit
call Gmail outside the transaction
finalize each reservation as ACCEPTED, DEFINITE_FAILURE, or UNKNOWN_OUTCOME
```

Never hold a database transaction or advisory lock while making a network request. A recovery job converts stale `RESERVED` rows to `UNKNOWN_OUTCOME`, because a crashed function may have transmitted the request.

Before claiming a new reminder batch:

```text
count all RESERVED, ACCEPTED, and UNKNOWN_OUTCOME Gmail attempts over previous 24 hours
totalRemaining = TOTAL_DAILY_BUDGET - count
reminderRemaining = REMINDER_CLAIM_CEILING - reminderCount
claimLimit = min(PROCESSOR_BATCH_LIMIT, totalRemaining, reminderRemaining)
```

If `remaining <= 0`, return a successful processor response with no claims and a sanitized quota state.

Count `RESERVED` and `UNKNOWN_OUTCOME` attempts against the budget because Gmail may have accepted them. Failed pre-request validation and connection failures proven to occur before request transmission may finalize as `DEFINITE_FAILURE` and stop consuming the application rolling budget.

Add a circuit breaker that pauses Gmail calls after repeated `auth_revoked`, mailbox daily-limit, or configuration failures. The health state must be visible through protected operational diagnostics without exposing credentials or addresses.

---

# 17. Supabase Cron

## 17.1 Extensions

Enable:

```text
pg_cron
pg_net
```

Supabase supports minute-level recurring jobs using `pg_cron` and HTTP requests using `pg_net`.

---

## 17.2 Schedule

Recommended MVP schedule:

```text
* * * * *
```

Every minute.

This gives Remindly practical support for hour-based reminders without needing a continuously running worker.

---

## 17.3 Cron target

```text
POST https://<vercel-production-domain>/api/internal/process-due-notifications
```

Header:

```text
x-scheduler-secret: <secret>
```

Store the scheduler secret in:

- Vercel encrypted environment variable;
- Supabase Vault for the cron SQL.

Do not hard-code it in migrations committed to Git.

---

## 17.4 Example Supabase cron SQL

Illustrative pattern:

```sql
select vault.create_secret(
  'https://remindly.vercel.app',
  'remindly_app_url'
);

select vault.create_secret(
  '<RANDOM_SECRET>',
  'remindly_scheduler_secret'
);
```

Then schedule:

```sql
select cron.schedule(
  'remindly-process-due-notifications',
  '* * * * *',
  $$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'remindly_app_url'
    ) || '/api/internal/process-due-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-scheduler-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'remindly_scheduler_secret'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Exact Vault/schema syntax should be checked against the active Supabase project when applied.

`net.http_post` is asynchronous. A successful cron SQL execution proves only that PostgreSQL queued an HTTP request; it does not prove that Vercel returned 2xx or that notifications were processed.

---

## 17.5 Cron delivery observability

The scheduled SQL must retain or expose the `pg_net` request ID. Operations must distinguish:

```text
cron job ran
HTTP request was queued
Vercel returned 2xx
processor completed successfully
```

Add a `ProcessorRun` table, or equivalent durable heartbeat, written by the Vercel endpoint:

```text
runId
startedAt
completedAt
status: RUNNING | SUCCEEDED | FAILED
claimed
sent
failed
recovered
sanitizedFailureCode
```

Do not store recipient addresses, reminder content, request secrets, or provider payloads. Retain processor runs for 30 days through the same versioned operational cleanup job.

Operational checks must detect:

- no successful processor run for more than three expected intervals;
- repeated non-2xx `pg_net` responses;
- a run stuck in `RUNNING` beyond the processing lease;
- repeated Gmail circuit-breaker activation.

The deployment runbook must include SQL for inspecting cron history and `pg_net` responses, rotating the Vault scheduler secret, and disabling/unscheduling the job safely.

---

## 17.6 Remove GitHub scheduler

After Supabase Cron is verified in production, remove or disable:

```text
.github/workflows/process-due-notifications.yml
```

Do not run two independent schedules unless intentionally testing overlap recovery.

---

# 18. Scheduler Endpoint Security

Keep the current constant-time secret comparison approach.

Current implementation hashes both provided and expected secret and compares with `timingSafeEqual`.

That is appropriate.

Additional requirements:

- minimum 32 random bytes recommended for `SCHEDULER_SECRET`;
- only accept POST;
- do not accept browser session as scheduler authorization;
- do not log request headers;
- response contains only aggregate counts;
- set `Cache-Control: no-store`;
- reject redirects at the caller side where possible.

---

# 19. Supabase PostgreSQL + Prisma on Vercel

## 19.1 Runtime connection

Vercel is serverless/auto-scaling.

Use Supabase's serverless-friendly pooled connection for application traffic.

Supabase documentation recommends transaction pooling for temporary/serverless clients.

Conceptually:

```env
DATABASE_URL=postgresql://...pooler.supabase.com:6543/postgres?sslmode=require
```

Use the exact current connection string provided by the Supabase dashboard for the project.

---

## 19.2 Migration connection

Use a non-transaction migration/session connection for Prisma migration operations.

Recommended variable:

```env
DIRECT_URL=postgresql://...pooler.supabase.com:5432/postgres?sslmode=require
```

Update `prisma.config.ts` so migration commands use `DIRECT_URL` in deployed/serverless environments.

Target configuration:

```ts
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DIRECT_URL'),
  },
});
```

Application runtime code continues to initialize `PrismaPg` with `DATABASE_URL`. CI and migration jobs must define both variables and fail before deployment when either is missing.

Do not run schema migrations through the transaction pooler.

---

## 19.3 Prisma client

Keep:

```text
@prisma/adapter-pg
pg
```

The existing global-client reuse in development is fine.

Ensure runtime initialization does not open uncontrolled connection counts.

---

## 19.4 Prisma and RLS

If the Prisma database role is configured with `BYPASSRLS`, Supabase RLS does not protect Prisma server-side queries.

Therefore:

> **User scoping in repository/service queries is mandatory.**

RLS can still protect any future direct Supabase Data API use, but it is not a replacement for user-aware Prisma repository design.

If the project never uses the Data API for application tables, consider disabling unnecessary Data API exposure as documented by Supabase.

---

# 20. Migration Ownership Strategy

Use two clearly separated infrastructure concerns.

## Prisma migrations

Own normal application tables in `public`:

```text
user_profiles
reminders
reminder_alerts
notifications
```

## Supabase integration SQL

Store Supabase-specific SQL under a dedicated directory, for example:

```text
infra/supabase/
  001-auth-profile-trigger.sql
  002-cron-notification-processor.sql
```

These scripts may reference:

```text
auth.users
vault
cron
net
```

Do not ask Prisma to manage Supabase's `auth` schema.

Document application order explicitly.

---

# 21. Data Migration Plan

## 21.1 If existing data does not need preservation

For a development-only dataset, the safest path is:

1. create a fresh Supabase project/database;
2. deploy the new schema;
3. create a real account through Supabase Auth;
4. seed no legacy singleton settings;
5. rebuild reminders manually/test fixtures.

This avoids carrying single-owner assumptions into the new model.

---

## 21.2 If existing reminders must be preserved

1. Create the owner's Supabase Auth account.
2. Obtain its Supabase user UUID.
3. Create `user_profiles` row through the auth trigger.
4. Add `user_id` nullable to existing reminders.
5. Set all legacy reminders to the owner UUID.
6. Make `user_id` NOT NULL.
7. Convert each legacy reminder:

   ```text
   endDate + alertTime/timezone
   -> dueAt / ReminderAlert.scheduledFor
   ```

8. Convert current Notification relation from `reminderId` to `reminderAlertId`.
9. Verify counts before dropping legacy columns.
10. Remove singleton `Settings` after values are copied to `UserProfile`.

Take a database backup/export before destructive migration.

---

# 22. Environment Variable Refactor

## 22.1 Remove

```env
AUTH_SECRET
OWNER_EMAIL
OWNER_PASSWORD_HASH
RESEND_API_KEY
RESEND_FROM
NEXTAUTH_URL
```

`AUTH_SECRET` is removed only after NextAuth is fully removed.

---

## 22.2 Add

```env
# App
APP_URL=https://remindly.vercel.app
NODE_ENV=production

# Supabase browser/SSR auth
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...

# Prisma/Supabase PostgreSQL
DATABASE_URL=postgresql://...:6543/postgres
DIRECT_URL=postgresql://...:5432/postgres

# Internal scheduler
SCHEDULER_SECRET=<random-32+-byte-secret>

# Supabase Auth Send Email Hook
SUPABASE_SEND_EMAIL_HOOK_SECRET=v1,whsec_...

# Gmail API
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...
GMAIL_SENDER_EMAIL=remindly.notifications@gmail.com
GMAIL_SENDER_NAME=Remindly
GMAIL_TOTAL_DAILY_BUDGET=350
GMAIL_AUTH_RESERVE=50
GMAIL_REQUEST_TIMEOUT_MS=10000
GMAIL_AUTH_HOOK_TOTAL_TIMEOUT_MS=4000
```

---

## 22.3 Secret handling

Never prefix Gmail values with `NEXT_PUBLIC_`.

The following must never reach the browser bundle:

```text
DATABASE_URL
DIRECT_URL
SUPABASE_SECRET_KEY
SCHEDULER_SECRET
SUPABASE_SEND_EMAIL_HOOK_SECRET
GMAIL_CLIENT_SECRET
GMAIL_REFRESH_TOKEN
```

Vercel environment values are encrypted at rest, but project members with adequate access may be able to inspect/manage them. Restrict project access accordingly.

`SUPABASE_SECRET_KEY` is used only by a server-only Supabase admin client for deleting the currently authenticated account and running explicit administrative repair operations. Never use that client for ordinary request data access, and never import it into Client Components, Proxy, or browser bundles. Legacy projects may expose an equivalent `service_role` key; use the current project-provided secret-key form when available.

Changing Vercel environment variables requires a new deployment for the new values to apply to deployment functions.

---

# 23. Gmail OAuth Bootstrap Procedure

Create a development-only script:

```text
scripts/gmail-authorize.ts
```

Purpose:

- run only on a trusted local machine;
- open/generate Google OAuth consent URL;
- request `gmail.send`;
- set `access_type=offline`;
- use `prompt=consent` when a new refresh token is intentionally required;
- exchange authorization code;
- print/store the refresh token securely;
- never commit token output.

The script must not be part of the production request path.

After obtaining the token:

1. put it into Vercel Production environment secrets;
2. optionally put a different sender credential set in Preview only if preview emails are intentionally enabled;
3. delete any temporary local token artifact or keep it only in a secure password/secrets manager.

Do not repeatedly rerun authorization because Google enforces refresh-token limits and older tokens can be invalidated.

---

# 24. Package Changes

Expected package changes:

## Remove

```text
next-auth
bcryptjs
resend
```

## Add

```text
@supabase/supabase-js
@supabase/ssr
standardwebhooks
```

Optional development-only OAuth helper:

```text
googleapis
@google-cloud/local-auth
```

The production Gmail adapter should preferably use direct REST calls and native fetch.

---

# 25. Expected File-Level Refactor

## Delete/retire

```text
src/server/auth/config.ts
src/server/auth/require-owner.ts
src/server/auth/session-cookie.ts
src/auth.ts
src/app/api/auth/[...nextauth]/route.ts
src/server/email/resend-provider.ts
.github/workflows/process-due-notifications.yml
```

Delete only after dependent code/tests have been migrated.

---

## Add

```text
src/lib/supabase/client.ts
src/lib/supabase/server.ts
src/lib/supabase/proxy.ts
src/lib/supabase/admin.ts
src/proxy.ts

src/server/auth/require-user.ts

src/server/email/gmail-oauth.ts
src/server/email/gmail-provider.ts
src/server/email/mime.ts
src/server/email/errors.ts

src/app/register/page.tsx
src/app/forgot-password/page.tsx
src/app/reset-password/page.tsx
src/app/auth/confirm/route.ts
src/app/api/internal/auth/send-email/route.ts

scripts/gmail-authorize.ts

infra/supabase/001-auth-profile-trigger.sql
infra/supabase/002-cron-notification-processor.sql
```

---

## Refactor heavily

```text
src/lib/env.ts
src/server/notifications/processor.ts
src/server/notifications/repository.ts
src/server/notifications/recovery.ts
src/server/reminders/repository.ts
src/server/reminders/service.ts
src/server/settings/repository.ts
src/server/settings/service.ts
src/server/dashboard/queries.ts
src/app/api/reminders/**
src/app/api/settings/route.ts
src/app/(protected)/**
prisma/schema.prisma
prisma/seed.ts
README.md
package.json
```

---

# 26. API Contract Changes

All user-facing endpoints must derive the user from Supabase session.

## Reminders

```text
GET    /api/reminders
POST   /api/reminders
GET    /api/reminders/:id
PATCH  /api/reminders/:id
POST   /api/reminders/:id/done
POST   /api/reminders/:id/renew
```

All operate only within authenticated user ownership.

---

## Settings

```text
GET   /api/settings
PATCH /api/settings
```

No global singleton.

Return current user's:

```text
email
emailVerified
timezone
defaultAlertTime
```

Do not allow direct update of `email` through Prisma.

Email identity changes must go through Supabase Auth.

---

## Account lifecycle

```text
DELETE /api/account
```

Requirements:

- authenticated session whose `auth_time` is no older than ten minutes; otherwise require reauthentication;
- same-origin/allow-listed `Origin` validation for the destructive cookie-authenticated request;
- no client-supplied target user ID;
- server deletes only the current Supabase Auth user;
- database cascade removes owned application data;
- response and logs contain no deleted profile data;
- operation is explicitly destructive and is not silently retried by the client.

---

## Internal processor

```text
POST /api/internal/process-due-notifications
```

Authorized only with `x-scheduler-secret`.

Suggested response:

```json
{
  "claimed": 4,
  "sent": 3,
  "failed": 1,
  "recovered": 0,
  "totalBudgetRemaining": 322,
  "reminderBudgetRemaining": 272,
  "circuitState": "closed"
}
```

No user PII.

---

## Auth Send Email Hook

```text
POST /api/internal/auth/send-email
```

Authorized only by Standard Webhooks signature.

On success:

```json
{}
```

with HTTP 200.

Failure contract:

```json
{
  "error": {
    "http_code": 503,
    "message": "Authentication email delivery is temporarily unavailable"
  }
}
```

Use a stable, non-sensitive user-facing message. Internally log only `runId`, action type, duration, and sanitized failure code. Return 400 for malformed supported payloads, 401 for invalid webhook signatures, 429 for application budget/rate limits, and 503 for temporary provider failure. Do not expose Google or verification-library response bodies.

---

# 27. Security Requirements

## SEC-001 — User isolation

Every Reminder/Alert query in user context contains authenticated `userId` ownership.

## SEC-002 — Verified destination

Reminder emails are sent only to the verified Supabase identity email.

## SEC-003 — No arbitrary recipient relay

Users cannot type any arbitrary notification destination address in the MVP.

## SEC-004 — Gmail credentials server-only

No Gmail OAuth credential appears in client code, HTML, logs, API responses, or repository files.

## SEC-005 — Hook verification

Supabase Send Email Hook raw request body must pass Standard Webhooks signature verification before payload use.

## SEC-006 — Scheduler authentication

Scheduler secret is random, server-only, compared in constant time, and never logged.

## SEC-007 — Header injection

Reject CR/LF in all MIME header fields.

## SEC-008 — HTML escaping

Escape reminder names and all user content before inclusion in HTML email.

## SEC-009 — No sensitive logs

Do not log:

- recipient email;
- auth email token;
- token hash;
- reminder title;
- email body;
- OAuth token;
- Gmail raw error response.

Use run IDs and sanitized error codes.

## SEC-010 — No public Supabase secret key

Do not expose Supabase `service_role` / secret API keys to the browser.

The server-only admin client using `SUPABASE_SECRET_KEY` is restricted to account deletion and explicit administrative repair paths. Ordinary user reads/writes continue through Prisma with authenticated ownership checks.

## SEC-011 — Open redirect prevention

Allow-list auth confirmation/reset destinations.

## SEC-012 — Abuse protection

Enable Supabase Auth rate limits before public signup. Add CAPTCHA/Turnstile when observed abuse or quota consumption crosses the documented operational threshold. The owner must be able to disable public signup without disabling login for existing users.

## SEC-013 — Auth Hook deadline

The Send Email Hook enforces a four-second application deadline, aborts outstanding provider requests, and never performs a blind retry after an ambiguous Gmail outcome.

## SEC-014 — Schedule-version integrity

A notification may be sent only when its schedule version and timestamp still match the enabled alert after claim and immediately before provider invocation.

## SEC-015 — Minimal operational ledgers

Email budget and processor-run tables contain only purpose, timestamps, aggregate counts, provider message ID where necessary, and sanitized status codes. They never contain recipient, subject, body, token, or reminder content.

## SEC-016 — User deletion

Deleting an Auth user removes the public profile and all owned application data through a tested database-level cascade or equivalent versioned trigger.

## SEC-017 — Secret rotation

The scheduler, Auth Hook, and Gmail OAuth secrets have documented rotation procedures. Rotation must not require committing a secret, returning it in an API response, or printing it in command output/logs.

## SEC-018 — CSRF and origin validation

Cookie-authenticated mutating route handlers must reject non-allow-listed `Origin` values. Server Actions remain subject to the installed Next.js 16 security model and still perform authorization inside the action. Internal scheduler and Auth Hook endpoints use their dedicated secret/signature contracts instead of browser cookies.

---

# 28. Gmail Quotas and Capacity Planning

As of the date of this specification:

- standard Gmail accounts are documented around **500 outgoing messages/day**;
- Gmail API `messages.send` consumes **100 quota units**;
- current Gmail API quota documentation lists **6,000 quota units/minute per user per project** for newer projects;
- therefore API rate quota allows roughly 60 `messages.send` operations/minute for one user before other constraints;
- Gmail's daily mailbox sending limit is the practical early bottleneck for Remindly.

Recommended operating target:

```text
All Remindly Gmail API attempts <= 350 / rolling 24h
Reminder attempts <= 300 / rolling 24h
Reserved Auth capacity = 50 / rolling 24h
```

`UNKNOWN_OUTCOME` attempts count against these limits. This leaves additional headroom below the documented mailbox ceiling for quota uncertainty and sends outside Remindly.

### Scale trigger

When expected volume approaches roughly 250-300 reminders/day consistently, prepare migration back to a transactional provider such as Resend/Brevo/SES rather than attempting to push a personal Gmail account to its limit.

The provider abstraction should make this migration possible without redesigning reminder business logic.

---

# 29. Cost and Free-Tier Reality

## Gmail API

Google currently states that standard Gmail API use is available without additional API cost, while also indicating that charging for quota excess is planned later in 2026 with advance notice.

Therefore:

> Treat `$0 Gmail API` as a current operating assumption, not a permanent contractual guarantee.

Re-check Google quota/pricing documentation before production launch and periodically afterward.

OAuth production readiness may require a public home page, privacy policy, accurate app identity, authorized origins/redirects, and verification of a domain owned by the developer. A shared `*.vercel.app` hostname must not be assumed to satisfy every Google production requirement. Before relying on an unattended long-lived refresh token, complete a Google OAuth readiness checklist and determine whether a custom domain is required. Domain registration would break a literal `$0` guarantee.

Gmail is not a transactional-email service and provides no Remindly-specific delivery SLA. Account throttling, anti-abuse enforcement, sender reputation, spam placement, or suspension can interrupt both reminder and Auth email delivery even when API quotas appear available.

## Supabase Free

Current Free plan is suitable for development/small beta but has important limitations, including limited database size and potential pausing after low activity.

A reminder application is time-sensitive. Test project-pausing behavior carefully and monitor Supabase announcements.

For a truly reliability-critical reminder service, a paid non-pausing database tier may eventually be necessary.

Verify before launch that the project has access to every required Free-plan feature, including Auth Send Email Hooks, Vault, Cron, `pg_net`, and the needed database connection modes. Record the observed limits and review date in the deployment runbook.

## Vercel Hobby

Vercel Hobby is free but is currently restricted to personal/non-commercial use.

This architecture is appropriate for:

- portfolio deployment;
- development;
- personal project;
- non-commercial beta.

If Remindly becomes commercial or is used for financial gain, re-evaluate Vercel plan requirements.

Hobby usage is capped. Reaching included limits can pause service rather than silently preserving reminder availability. The operational runbook must identify which Vercel usage metrics are checked and the threshold at which signup or reminder creation is temporarily disabled.

## Cost objective statement

The approved product statement is:

> Remindly is designed to operate at `$0` for a low-volume, personal/non-commercial beta while Gmail, Supabase, and Vercel remain within their current free-tier limits and policies.

Do not market or document the architecture as “free forever,” “100% guaranteed `$0`,” or suitable for reliability-critical reminders. Provider change is an expected operational path, not an exceptional redesign.

---

# 30. Observability

## Existing health endpoint

Keep:

```text
GET /api/health
```

Check database connectivity only.

Do not make public health checks send Gmail messages.

---

## Structured processor logs

Allowed:

```text
runId
claimed
sent
failed
recovered
durationMs
sanitized provider error category
```

Not allowed:

```text
recipient address
subject
body
reminder name
OAuth token
hook payload
```

---

## Notification history

The authenticated user may view status for their own reminders:

```text
Pending
Processing
Sent
Failed
Cancelled
```

Provider message IDs should normally remain internal and need not be displayed.

---

# 31. Testing Strategy

## 31.1 Unit tests

Add tests for:

### Gmail OAuth

- token request form encoding;
- cached token reuse;
- refresh before expiry;
- `invalid_grant` classification;
- timeout behavior;
- no secrets in thrown public errors.

### MIME

- plain + HTML multipart generation;
- UTF-8 subjects/content;
- base64URL encoding;
- address validation;
- CR/LF header rejection;
- HTML escaping.

### Gmail provider

- successful send stores Gmail message ID;
- 400 permanent error;
- 401 auth error;
- 403 quota classification;
- 429 rate-limit classification;
- 5xx retryable error;
- network timeout unknown outcome.

### Auth hook

- valid Standard Webhooks signature accepted;
- invalid signature rejected;
- missing/expired webhook timestamp rejected;
- `v1,whsec_` secret normalization;
- malformed payload rejected;
- signup template;
- recovery template;
- secure and non-secure email-change field mapping;
- invite and magic-link mapping when enabled;
- action-specific `verifyOtp` type;
- warm-token and cold-refresh paths complete within the four-second application deadline;
- timeout aborts provider work and does not retry an ambiguous send;
- unknown action behavior.

### Gmail budget

- reminder and Auth sends share the total budget;
- reminder sends cannot consume the Auth reserve;
- simultaneous Auth and reminder reservations cannot exceed either ceiling;
- reminder claim and budget reservation commit or roll back together;
- accepted and unknown outcomes consume budget;
- stale reservations recover to unknown outcome;
- proven pre-request failures do not consume budget;
- circuit breaker opens and recovers according to policy.

---

## 31.2 Integration tests

### Multi-user isolation

Create:

```text
User A
User B
Reminder A owned by A
Reminder B owned by B
```

Assert:

- A cannot fetch B;
- A cannot update B;
- A cannot complete B;
- A cannot renew B;
- A cannot see B notification rows.
- deleting A removes A's profile/application data without changing B's data.
- reconciliation reports and repairs a missing profile without exposing email in logs.

### Notification processor

Use a fake `EmailProvider`.

Do not require real Gmail in standard test runs.

Test:

- due alert -> sent;
- future alert -> untouched;
- cancelled alert -> not sent;
- reminder becomes DONE -> pending notifications cancelled;
- stale PROCESSING lease recovered;
- failed send retries;
- max attempts stops;
- unverified/missing user email prevents send;
- two simultaneous processor invocations do not double-claim.
- editing an alert after claim but before send cancels the obsolete schedule version;
- processor-run heartbeat reaches `SUCCEEDED` on success and `FAILED` on route failure;
- Gmail budget exhaustion makes no claims and consumes no notification attempt.

### User preference timezone

Test Casablanca and at least one DST-observing timezone.

---

## 31.3 End-to-end tests

Keep Playwright but update auth setup.

Primary E2E environment should not send real Gmail.

Recommended test configuration:

```env
EMAIL_PROVIDER=fake
```

Production accepts only:

```env
EMAIL_PROVIDER=gmail
```

If a full Gmail smoke test is required, make it an explicit manual test against a controlled mailbox.

---

# 32. Deployment Procedure

## Phase A — Google Cloud/Gmail

1. Create dedicated Gmail sender account.
2. Secure account with strong password/recovery configuration.
3. Create Google Cloud project.
4. Enable Gmail API.
5. Configure OAuth application.
6. Request only `gmail.send`.
7. Complete the production-readiness checklist: public home page, privacy policy, app identity, authorized origins/redirects, and owned-domain verification when required.
8. Move production OAuth project out of Testing before relying on long-lived refresh token.
9. Run local authorization bootstrap.
10. Store refresh token securely.
11. Perform one controlled Gmail API send test.
12. Record the OAuth project state and review date without recording credentials.

---

## Phase B — Supabase

1. Create Supabase project.
2. Save project URL and publishable key.
3. Configure email/password Auth.
4. Require email confirmation.
5. Set Site URL:

   ```text
   https://<project>.vercel.app
   ```

6. Add allowed redirect URLs.
7. Create database schema with Prisma.
8. Apply profile trigger SQL.
9. Enable `pg_cron` and `pg_net`.
10. Configure Auth Send Email Hook after Vercel endpoint is deployed.
11. Configure Cron after Vercel processor is deployed.

---

## Phase C — Vercel

1. Import Git repository.
2. Deploy Next.js project.
3. Configure Production environment variables.
4. Use Supabase pooled runtime DB URL.
5. Use migration/session URL for migration commands.
6. Set `APP_URL` to production `*.vercel.app` origin.
7. Redeploy after environment variable changes.
8. Verify `/api/health`.

---

## Phase D — Database migration

Run:

```text
npx prisma validate
npx prisma generate
npx prisma migrate deploy
```

using the correct migration connection.

Then apply Supabase-specific integration SQL.

Do not make production deployments depend on `prisma migrate dev`.

---

## Phase E — Configure Supabase Auth hook

Create HTTP Send Email Hook targeting:

```text
https://<vercel-domain>/api/internal/auth/send-email
```

Generate hook secret.

Add that secret to Vercel:

```env
SUPABASE_SEND_EMAIL_HOOK_SECRET=...
```

Redeploy.

Test signup, password recovery, and every enabled email action with exact token mapping. Measure warm-token and cold-refresh hook duration and require both to finish within Supabase's five-second deadline.

---

## Phase F — Configure Supabase Cron

Store:

```text
APP_URL
SCHEDULER_SECRET
```

in Supabase Vault.

Create the minute cron job.

Verify cron invocation reaches Vercel and produces safe aggregate logs. Inspect the `pg_net` response status and verify the matching `ProcessorRun` reaches `SUCCEEDED`; cron history alone is insufficient.

---

# 33. Production Acceptance Criteria

The refactor is considered deployment-ready only when all criteria below pass.

## Authentication

- [ ] New user can register with email/password.
- [ ] Confirmation email is sent through Gmail API.
- [ ] Unconfirmed user cannot complete protected login flow when confirmation is required.
- [ ] Confirmation link returns to Vercel app and creates a valid session.
- [ ] Password recovery email is sent through Gmail API.
- [ ] Signup, recovery, invite, magic-link, and both email-change mappings pass action-specific contract tests for every enabled action.
- [ ] Auth Hook succeeds within the five-second Supabase deadline on warm-token and cold-refresh paths.
- [ ] Auth Hook timeout returns the documented sanitized Supabase error shape and does not retry an ambiguous send.
- [ ] Logout invalidates/clears session correctly.
- [ ] Account deletion removes the Auth user, profile, reminders, alerts, and notifications; non-PII aggregate operational ledgers follow their bounded retention policy.

## User isolation

- [ ] User A cannot read User B's reminders.
- [ ] User A cannot mutate User B's reminders.
- [ ] User A cannot see User B's notification history.
- [ ] Cookie-authenticated mutations reject non-allow-listed origins.

## Reminder behavior

- [ ] Reminder can include date and time.
- [ ] Multiple alert schedules are supported.
- [ ] Alert times are converted correctly using user timezone.
- [ ] Fixed-duration offset semantics are documented in the UI and tested across a daylight-saving transition.
- [ ] Editing due time rebuilds only necessary future alerts/notifications.
- [ ] Editing an alert during a `PROCESSING` lease cannot send an obsolete schedule version.
- [ ] Duplicate same-time alerts are rejected.
- [ ] Changing profile timezone does not silently move existing absolute schedules.
- [ ] Completing reminder cancels unsent notifications.
- [ ] Renewal history remains valid.

## Gmail

- [ ] Dedicated sender OAuth refresh token works after redeploy/cold start.
- [ ] Gmail provider stores returned Gmail message ID.
- [ ] all reminder and Auth send attempts participate in the global Gmail budget.
- [ ] `UNKNOWN_OUTCOME` attempts consume budget and document duplicate risk.
- [ ] Auth reserve and reminder ceiling stop sends at their configured boundaries.
- [ ] 429/5xx failures trigger bounded retries.
- [ ] Gmail 403 reasons distinguish retryable quota failures from permanent permission/configuration failures.
- [ ] revoked/invalid refresh token produces recognizable sanitized operational failure.
- [ ] repeated Auth/quota/configuration failures open the Gmail circuit breaker.
- [ ] MIME handles UTF-8 and HTML escaping.
- [ ] no arbitrary sender or destination injection is possible.

## Scheduling

- [ ] Supabase Cron calls processor every minute.
- [ ] cron history proves the job ran and `pg_net` response inspection proves Vercel returned 2xx.
- [ ] each invocation writes a sanitized `ProcessorRun` heartbeat.
- [ ] missing success for three expected intervals is detectable operationally.
- [ ] invalid scheduler secret returns 401.
- [ ] scheduler secret rotation is tested without exposing the secret in SQL migrations or logs.
- [ ] overlapping invocations cannot double-claim a notification.
- [ ] missed invocation is caught up by the next run.

## Deployment

- [ ] Vercel build succeeds.
- [ ] Next.js 16 uses `src/proxy.ts`; legacy `src/middleware.ts` is removed.
- [ ] production uses pooled Supabase DB URL.
- [ ] migrations use correct non-transaction migration/session connection.
- [ ] no local worker is required in production.
- [ ] no GitHub scheduled workflow is required.
- [ ] Google OAuth production-readiness requirements, authorized domains, homepage, and privacy policy are verified.
- [ ] current Gmail, Supabase, and Vercel free-tier assumptions are recorded with review dates.

## Privacy/logging

- [ ] no email addresses in normal processor logs.
- [ ] no OAuth tokens in logs.
- [ ] no auth tokens/token hashes in logs.
- [ ] no reminder content in aggregate cron logs.
- [ ] `EmailSendAttempt` and `ProcessorRun` contain no recipient, subject, body, Auth token, or reminder title.

---

# 34. Recommended Implementation Sequence

Implement in this order to reduce breakage.

## Step 1 — Introduce Supabase connection configuration

- connect existing Prisma application to Supabase PostgreSQL;
- keep existing single-user behavior temporarily;
- verify migrations/tests/build.

## Step 2 — Add target schema behind existing behavior

- create `user_profiles` and profile synchronization/deletion SQL;
- add nullable ownership columns and backfill legacy rows;
- add multi-alert, schedule-version, email-attempt, and processor-run models;
- migrate existing schedules and verify row/count invariants;
- keep public signup disabled;
- keep legacy reads available until backfill verification passes.

Gate: schema validation, migration rehearsal, rollback rehearsal, and existing tests pass.

## Step 3 — Add Supabase Auth and Next.js 16 Proxy

- install Supabase packages;
- implement browser/server clients and `src/proxy.ts`;
- add register/login/confirmation/recovery UI and routes;
- implement server-only `requireUser()`;
- enforce ownership in repositories/services/routes;
- add IDOR and account-deletion tests;
- keep registration feature-gated until Auth email delivery is ready.

Gate: two-user isolation passes across every API, server action, dashboard query, and settings operation.

## Step 4 — Add Gmail provider and global budget

- implement OAuth refresh, MIME generation, and Gmail send;
- implement error-reason classification and circuit breaker;
- implement the global `EmailSendAttempt` budget with Auth reserve;
- retain the fake provider for standard tests;
- run one controlled manual Gmail smoke test.

Gate: provider/unit tests pass and no secret or PII appears in errors/logs.

## Step 5 — Add Supabase Send Email Hook endpoint

- implement exact Standard Webhooks secret normalization and raw-body verification;
- implement the action/token mapping table as a discriminated union;
- enforce the four-second application deadline;
- test warm-token and cold-refresh paths;
- enable the hook in Supabase;
- confirm signup, recovery, and enabled email-change flows.

Gate: Auth Hook completes within Supabase's five-second limit and all enabled action fixtures pass.

## Step 6 — Enable public Supabase Auth and remove NextAuth dependency

- enable registration only after Step 5 passes in the deployed environment;
- verify profile creation/update/delete triggers;
- switch protected flows fully to Supabase sessions;
- remove owner-only auth from active request paths, but retain rollback deployment.

## Step 7 — Enable multi-alert UI and schedule-version processing

- expose `dueAt` and multiple alert rules in validation/UI;
- implement fixed-duration offset semantics;
- rebuild future notifications transactionally on edits;
- preserve sent history and cancel obsolete schedule versions;
- test daylight-saving boundaries and edit/send races.

## Step 8 — Switch reminder delivery to Gmail

- resolve recipient from the current verified profile at send time;
- apply schedule-version and status checks before and after claim;
- enable Gmail behind `EMAIL_PROVIDER=gmail`;
- monitor the global budget, circuit breaker, and sanitized failures;
- retain Resend rollback until the Gmail path is stable.

## Step 9 — Add Supabase Cron and processor heartbeat

- enable `pg_cron` and `pg_net`;
- store URL/secret in Vault;
- schedule every minute;
- persist `ProcessorRun` state;
- inspect `pg_net` response status rather than relying only on cron success;
- verify overlap, catch-up, stale-run, secret-rotation, and unschedule behavior.

## Step 10 — Remove legacy single-owner infrastructure

Delete:

```text
OWNER_EMAIL
OWNER_PASSWORD_HASH
AUTH_SECRET
RESEND_API_KEY
RESEND_FROM
singleton Settings
NextAuth credentials code
GitHub notification workflow
```

Remove Resend only after the rollback observation window defined in Section 35 has passed.

## Step 11 — Full regression and production-readiness suite

Run:

```text
npm test
npm run lint
npx tsc --noEmit
npm run build
npm run test:e2e
```

Then complete production acceptance checklist.

Do not enable unrestricted public signup until the complete authentication, Gmail budget, abuse-control, and free-tier readiness checks pass in Production.

---

# 35. Rollback Strategy

Before schema migration:

- export database data;
- tag the last Resend/single-owner code commit;
- keep the previous Vercel deployment available for rollback;
- do not delete old database columns until new data has been validated.

For Gmail integration rollout:

1. deploy provider behind an environment flag;
2. test controlled Gmail sends;
3. switch reminder processor to Gmail;
4. monitor sanitized failure codes;
5. keep Resend credentials/code available for a minimum seven-day observation window;
6. during that window, successfully exercise signup, recovery, reminder delivery, token refresh after cold start, quota/circuit-breaker simulation, and cron catch-up;
7. remove Resend only after the observation checklist passes.

Rollback does not undo already-sent Gmail messages or remove possible duplicates from ambiguous outcomes. A database rollback must never restore `PENDING` status to notifications already recorded as `SENT` by the newer deployment.

Temporary provider switch:

```env
EMAIL_PROVIDER=gmail
```

Keep the interface generic enough that:

```env
EMAIL_PROVIDER=resend
```

could be reintroduced later without changing reminder business logic.

---

# 36. Operational Risks

## Risk 1 — Gmail account send suspension / quota

**Impact:** Reminder emails stop.  
**Mitigation:** Dedicated account, conservative daily budget, bounded retries, migration path to transactional provider.

## Risk 2 — OAuth refresh token invalidated

**Impact:** All Gmail sends fail.  
**Mitigation:** Published OAuth app, dedicated account, token-health operational code, documented reauthorization procedure.

## Risk 3 — Gmail ambiguous send causes duplicate

**Impact:** User may receive duplicate reminder.  
**Mitigation:** durable claim lease and retry boundaries; document at-least-once semantics; avoid broader restricted Gmail scopes solely for reconciliation.

## Risk 4 — Supabase Free project pausing

**Impact:** Database/cron can become unavailable on low-activity project.  
**Mitigation:** monitor project state; validate free-tier behavior; upgrade if reminders become reliability-critical.

## Risk 5 — Vercel Hobby policy/limits

**Impact:** Cannot remain free for commercial use or may hit usage limits.  
**Mitigation:** use only for permitted personal/non-commercial deployment; upgrade/change host if product becomes commercial.

## Risk 6 — Auth hook outage

**Impact:** Signup/recovery emails fail.  
**Mitigation:** short synchronous endpoint, Gmail timeout, safe error reporting, manual recovery path for owner during beta.

## Risk 7 — Auth trigger defect

**Impact:** Supabase signup may fail.  
**Mitigation:** keep trigger minimal; integration-test; version SQL; avoid unrelated business logic inside trigger.

## Risk 8 — Auth Hook exceeds five seconds

**Impact:** Supabase reports signup/recovery failure even if Gmail later accepts the message.

**Mitigation:** four-second application deadline, warm/cold latency tests, no in-request retry after ambiguous send, clear user retry guidance.

## Risk 9 — Cron queued but processor failed

**Impact:** PostgreSQL records a successful cron job while reminders remain unsent.

**Mitigation:** inspect `pg_net` responses, persist `ProcessorRun` heartbeats, detect three missed success intervals.

## Risk 10 — OAuth production/domain requirement creates cost

**Impact:** A custom verified domain or additional compliance work may be required, invalidating a literal `$0` claim.

**Mitigation:** complete Google OAuth production-readiness review before launch; treat `$0` as a constrained target; do not promise free-forever operation.

## Risk 11 — Public Auth abuse consumes Gmail quota

**Impact:** Automated signup/recovery abuse exhausts the shared Gmail budget and blocks real reminders or account recovery.

**Mitigation:** Supabase rate limits, CAPTCHA/Turnstile when needed, global send ledger, Auth reserve, per-purpose circuit breaker, ability to disable public signup.

## Risk 12 — Schedule edit races with a leased notification

**Impact:** An obsolete reminder time may be emailed after the user edits the alert.

**Mitigation:** schedule versions copied to notifications, eligibility checked before and after claim, obsolete versions cancelled without mutating sent history.

---

# 37. Future Migration Path to a Transactional Email Provider

Gmail is appropriate for a low-volume personal beta, not for large-scale transactional sending.

The code should preserve:

```ts
interface EmailProvider {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}
```

so a future provider can be introduced:

```text
ResendEmailProvider
BrevoEmailProvider
SesEmailProvider
PostmarkEmailProvider
```

without changing:

- reminder ownership;
- notification ledger;
- retry state machine;
- cron scheduling;
- user model.

A future transactional provider may restore true provider idempotency and higher quotas.

---

# 38. Definition of Done

The refactor is complete when Remindly no longer depends on any of the following production concepts:

```text
one global owner
OWNER_EMAIL
OWNER_PASSWORD_HASH
singleton notification email
Resend-specific runtime code
local notification worker in production
manual-only GitHub workflow
legacy `src/middleware.ts`
untracked Gmail send paths outside the global budget
```

and the production chain is:

```text
Vercel Next.js
    |
    +--> Supabase Auth
    |       |
    |       +--> Send Email Hook --> Vercel --> Gmail API
    |
    +--> Prisma --> Supabase PostgreSQL
    |
Supabase Cron
    |
    +--> Vercel notification processor
             |
             +--> user-owned ReminderAlert
             +--> schedule-version guard
             +--> durable Notification ledger
             +--> verified user email
             +--> Gmail API
                     |
                     +--> EmailSendAttempt budget ledger
```

Operations can prove the difference between a cron job being scheduled, an HTTP request being queued, and a processor run succeeding through `pg_net` response inspection plus `ProcessorRun` heartbeats.

This architecture directly supports the intended Remindly product behavior:

> A user signs up with an email address, confirms ownership of that address, creates reminders, chooses one or more alert times, and Remindly automatically sends those reminders to that verified email address without requiring the user to connect a Gmail account or requiring Remindly to own a custom email domain.

The final clause is a product-email requirement, not an OAuth-domain guarantee. Google production-readiness requirements may still require Remindly to own a web domain; if so, the deployment no longer satisfies a literal `$0` promise.

---

# 38.1. Implementation checkpoint — Supabase foundation

The first implementation slice is complete on branch `refacto`.

Migration applied:

```text
20260830213000_refactor_foundation
```

This slice deliberately preserves the current application while adding the database structures needed for the target architecture:

```text
UserProfile                    present; not yet synchronized with auth.users
Reminder.userId                present and nullable during backfill
ReminderAlert                  present
Notification.reminderAlertId  present and nullable during transition
Notification.scheduleVersion   present and nullable during transition
EmailSendAttempt               present
ProcessorRun                   present
Settings                       retained for legacy single-owner behavior
legacy reminder fields         retained for compatibility
legacy notification fields     retained for compatibility
```

The following target behaviors were added after this migration in the authenticated ownership slice:

1. Supabase browser, server, and admin clients are present; user-facing authentication uses Supabase Auth.
2. User-facing reminder, dashboard, and settings routes derive identity through `requireUser()` and pass the authenticated user ID into the application services.
3. User-facing reminder repository queries and dashboard aggregates are scoped by user ID. User settings read/write the authenticated `UserProfile`, and the settings UI cannot configure an arbitrary notification destination.
4. `DELETE /api/account` validates same-origin requests, requires an access token with an `auth_time` no older than ten minutes, and deletes only the authenticated Supabase user through the server-only admin client.

The following target behaviors remain for the next slices:

1. Deploy and rehearse the hosted Supabase SQL trigger that creates `public.user_profiles` from `auth.users`, plus the selected deletion policy and a repair/reconciliation job. This SQL remains separate from the Prisma migration because the local PostgreSQL test database does not contain Supabase's managed `auth.users` schema.
2. Backfill `Reminder.userId`, make ownership non-null after the backfill gate passes, and remove the temporary repository/service compatibility overloads.
3. Migrate the existing one-alert model to `ReminderAlert` and versioned notifications, including schedule-version race protection.
4. Implement Gmail provider delivery, Auth Hook delivery, the shared budget reservation, processor state machine, and Supabase Cron/`pg_net` observability.

The legacy singleton settings path, Resend provider, and compatibility test fixtures remain intentionally available until those later slices are complete. They are not used by the new authenticated user-facing routes.

The migration is additive and was rehearsed against the isolated test database. Existing singleton settings and legacy reminder/notification rows remain readable. No Supabase Auth project, Gmail account, Vercel deployment, or paid service is required for this foundation slice.

---

## 38.2. Implementation checkpoint — authenticated ownership slice

The second implementation slice is complete on branch `refacto`.

Implemented boundaries:

```text
src/lib/supabase/admin.ts              server-only admin client
src/server/auth/require-user.ts        server-validated identity
src/app/api/account/route.ts           recent-auth account deletion
src/server/profile/*                   user profile preferences
src/server/reminders/repository.ts     authenticated ownership filters
src/server/reminders/service.ts        trusted user ID propagation
src/server/dashboard/queries.ts        user-scoped aggregate SQL
src/app/api/**                         user ID derived from requireUser()
```

The account deletion endpoint is protected by an explicit `Origin` allow-list and a ten-minute JWT `auth_time` freshness check. It never accepts a target user ID from the request.

The settings API and UI expose the verified Supabase account email, timezone, and default alert time. They no longer accept or return a free-form notification destination.

The schema is still transitional. `Reminder.userId` remains nullable until the profile synchronization trigger is deployed and existing reminders are backfilled. The legacy singleton and provider remain only for compatibility with the not-yet-migrated processor and historical test fixtures.

Focused verification for this slice:

```text
unit security/profile/ownership tests: passing
npx tsc --noEmit: passing
npm run lint -- --quiet: passing
```

---

# 39. Official References Consulted

The following official documentation was used to validate this specification on 2026-08-30.

## Google / Gmail

1. Gmail API — Create and send email messages  
   https://developers.google.com/workspace/gmail/api/guides/sending

2. Gmail API — `users.messages.send`  
   https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send

3. Gmail API — Choose Gmail API scopes  
   https://developers.google.com/workspace/gmail/api/auth/scopes

4. Google OAuth 2.0 for Web Server Applications  
   https://developers.google.com/identity/protocols/oauth2/web-server

5. Google OAuth 2.0 — refresh-token expiration rules  
   https://developers.google.com/identity/protocols/oauth2

6. Google OAuth production readiness / app state  
   https://developers.google.com/identity/protocols/oauth2/production-readiness/overview

6a. [Google OAuth production policy compliance](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance)

7. Gmail API usage limits and quotas  
   https://developers.google.com/workspace/gmail/api/reference/quota

8. Gmail sending limits  
   https://support.google.com/mail/answer/22839

9. Google OAuth verification exception information  
   https://support.google.com/cloud/answer/13464323

## Supabase

10. Supabase Auth with Next.js  
    https://supabase.com/docs/guides/auth/quickstarts/nextjs

11. Supabase SSR Auth  
    https://supabase.com/docs/guides/auth/server-side

12. Supabase Auth user management / public profile trigger pattern  
    https://supabase.com/docs/guides/auth/managing-user-data

13. Supabase Send Email Auth Hook  
    https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook

14. Supabase Auth Hooks overview  
    https://supabase.com/docs/guides/auth/auth-hooks

15. Supabase custom SMTP limitations/default provider  
    https://supabase.com/docs/guides/auth/auth-smtp

16. Supabase scheduled functions / `pg_cron` + `pg_net`  
    https://supabase.com/docs/guides/functions/schedule-functions

17. Supabase `pg_net`  
    https://supabase.com/docs/guides/database/extensions/pg_net

18. Supabase + Prisma  
    https://supabase.com/docs/guides/database/prisma

19. Supabase database connection management  
    https://supabase.com/docs/guides/database/connecting-to-postgres

20. Supabase Free project pausing  
   https://supabase.com/docs/guides/platform/free-project-pausing

## Next.js

20a. [Next.js 16 Proxy convention](https://nextjs.org/docs/app/getting-started/proxy)

20b. [Next.js authentication and authorization guidance](https://nextjs.org/docs/app/guides/authentication)

## Vercel

21. Vercel environment variables  
    https://vercel.com/docs/environment-variables

22. Vercel Functions limits  
    https://vercel.com/docs/functions/limitations

23. Vercel Hobby plan  
    https://vercel.com/docs/plans/hobby

24. Vercel Fair Use Guidelines  
    https://vercel.com/docs/limits/fair-use-guidelines

---

# 40. Final Technical Recommendation

Proceed with the refactor using this specific combination:

```text
Frontend + API       : Next.js on Vercel
Authentication       : Supabase Auth
Database             : Supabase PostgreSQL + Prisma
Auth email transport : Supabase Send Email Hook -> Vercel -> Gmail API
Reminder transport   : Vercel -> Gmail API
Scheduler            : Supabase pg_cron + pg_net
Sender identity      : Dedicated Gmail account
Recipient identity   : Verified Supabase user email
```

This is the smallest coherent architecture that meets the current goals while preserving the strongest part of the existing Remindly implementation: its durable notification processing state machine.

The two largest refactors are **multi-user ownership** and **Supabase Auth migration**. The Gmail provider itself is comparatively contained because the project already has an email-provider abstraction.

The Gmail approach should be treated as a **low-volume beta/portfolio architecture**. Keep the provider boundary clean so Remindly can switch back to a dedicated transactional email provider once user volume, reliability requirements, or commercial use justify it.
