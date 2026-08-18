# Remindly MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Build the private Remindly MVP so one owner can create a deadline reminder, understand its urgency, receive one intended email, and mark the reminder done or renew it.

**Architecture:** Use a single Next.js App Router application with server-rendered protected pages, small client components for charts/forms/drawers, and a PostgreSQL database accessed through Prisma. Keep reminder, urgency, scheduling, renewal, and notification state-machine rules in server/domain services; route handlers and server actions only authenticate, validate, call those services, and serialize results.

**Tech Stack:** Next.js App Router, React, TypeScript, PostgreSQL, Prisma, Zod, date-fns/date-fns-tz, Recharts, Lucide React, Auth.js credentials, Resend adapter, Vitest, React Testing Library, Playwright, Docker Compose, and GitHub Actions.

**Spec:** docs/superpowers/specs/2026-08-19-remindly-mvp-design.md

## Global Constraints

- Product name is Remindly; Never Miss It is historical study wording only.
- The MVP has one owner, no public signup, no multi-user ownership, and no organization or role UI.
- end_date is a calendar DATE; alert_at is a TIMESTAMPTZ calculated in the configured IANA timezone.
- Urgency states are exactly OVERDUE, URGENT, SOON, and SAFE, with calendar-day boundaries of < 0, 0-3, 4-14, and 15+.
- A reminder cycle creates one PENDING email notification in the same transaction as reminder creation or renewal.
- Schedule-affecting edits, completion, renewal, and timezone changes must not leave stale PENDING rows.
- The processor claims rows atomically, uses a 15-minute processing lease, retries at most five times, and reuses the notification UUID as the provider idempotency key when supported.
- The guarantee is one logical/intended provider send per reminder cycle, not an absolute mailbox-delivery exactly-once guarantee.
- The approved visual references and .superdesign/design-system.md are the production UI source of truth.
- The UI must meet WCAG 2.2 AA, expose text equivalents for charts, preserve keyboard focus, and use text as well as color for urgency.
- TDD is mandatory for production behavior: write one failing test, observe the expected failure, implement the smallest passing change, then refactor while green.
- Use the in-app Browser for visual and interaction QA when available; if it is unavailable, record that fact and use Playwright as the documented fallback.
- Do not add categories, tags, search, advanced filters, balances, finance tracking, recurrence, SMS, push, WhatsApp, calendar integrations, AI features, Redis, or a separate analytics warehouse.

## File Structure

The implementation is split by responsibility. These paths are the stable interfaces between tasks:

~~~
.
├── .env.example
├── .github/workflows/process-due-notifications.yml
├── docker-compose.yml
├── next.config.ts
├── package.json
├── playwright.config.ts
├── prisma/schema.prisma
├── src
│   ├── app
│   │   ├── (protected)/page.tsx
│   │   ├── (protected)/layout.tsx
│   │   ├── (protected)/reminders/page.tsx
│   │   ├── (protected)/settings/page.tsx
│   │   ├── api/dashboard/route.ts
│   │   ├── api/health/route.ts
│   │   ├── api/internal/process-due-notifications/route.ts
│   │   ├── api/reminders/route.ts
│   │   ├── api/reminders/[id]/route.ts
│   │   ├── api/reminders/[id]/done/route.ts
│   │   ├── api/reminders/[id]/renew/route.ts
│   │   ├── api/settings/route.ts
│   │   ├── login/page.tsx
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components
│   │   ├── dashboard/
│   │   ├── layout/
│   │   ├── reminders/
│   │   ├── settings/
│   │   └── ui/
│   ├── lib
│   │   ├── env.ts
│   │   ├── http.ts
│   │   └── result.ts
│   ├── server
│   │   ├── auth/
│   │   ├── dashboard/
│   │   ├── db/
│   │   ├── email/
│   │   ├── notifications/
│   │   ├── reminders/
│   │   ├── settings/
│   │   ├── urgency/
│   │   └── validation/
│   └── auth.ts
├── tests
│   ├── e2e/
│   ├── integration/
│   ├── setup.ts
│   └── unit/
├── tsconfig.json
└── vitest.config.ts
~~~

The server modules contain domain behavior and persistence boundaries. The components modules contain presentation and browser interaction only. The route files contain no state-machine logic.

---

### Task 1: Bootstrap the application and test harness

**Files:**
- Create: package.json, package-lock.json, tsconfig.json, next.config.ts, vitest.config.ts, playwright.config.ts
- Create: .gitignore, .env.example, docker-compose.yml
- Create: src/app/layout.tsx, src/app/(protected)/page.tsx, src/app/globals.css
- Create: src/lib/env.ts, src/lib/http.ts, src/lib/result.ts, tests/setup.ts, tests/unit/env.test.ts, tests/app/smoke.test.tsx

**Interfaces:**
- src/lib/env.ts exports serverEnv(), which returns DATABASE_URL, AUTH_SECRET, OWNER_EMAIL, OWNER_PASSWORD_HASH, SCHEDULER_SECRET, RESEND_API_KEY, APP_URL, and NODE_ENV without parsing process.env during module import.
- src/app/layout.tsx exports RootLayout({ children }: Readonly<{ children: React.ReactNode }>).
- src/app/(protected)/page.tsx exports a temporary server-rendered HomePage that returns a named loading shell until the dashboard task replaces it.

- [ ] **Step 1: Create the package and scripts.**

~~~powershell
npm init -y
npm install next react react-dom next-auth bcryptjs @prisma/client zod date-fns date-fns-tz recharts lucide-react resend
npm install -D typescript @types/node @types/react @types/react-dom prisma tsx eslint eslint-config-next vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @vitejs/plugin-react @playwright/test
~~~

Set these scripts in package.json:

~~~json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:studio": "prisma studio"
  }
}
~~~

Add the Prisma seed command to package.json:

~~~json
{
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
~~~

Install tsx as a development dependency so the seed can run in the TypeScript toolchain.

- [ ] **Step 2: Write the failing environment test.**

~~~typescript
// tests/unit/env.test.ts
import { describe, expect, it } from 'vitest';
import { parseServerEnv } from '@/lib/env';

describe('parseServerEnv', () => {
  it('rejects a missing owner password hash', () => {
    expect(() => parseServerEnv({
      DATABASE_URL: 'postgresql://localhost/remindly',
      AUTH_SECRET: 'a'.repeat(32),
      OWNER_EMAIL: 'owner@example.com',
      OWNER_PASSWORD_HASH: '',
      SCHEDULER_SECRET: 's'.repeat(16),
      RESEND_API_KEY: 're_test',
      APP_URL: 'http://localhost:3000',
      NODE_ENV: 'test',
    })).toThrow('OWNER_PASSWORD_HASH');
  });
});
~~~

~~~typescript
// tests/app/smoke.test.tsx
import { render, screen } from '@testing-library/react';
import HomePage from '@/app/(protected)/page';

it('renders the Remindly loading shell', () => {
  render(<HomePage />);
  expect(screen.getByText('Remindly')).toBeVisible();
});
~~~

- [ ] **Step 3: Run the test and observe the expected missing-module failure.**

~~~powershell
npm test -- tests/unit/env.test.ts
~~~

Expected: FAIL because @/lib/env does not exist yet.

- [ ] **Step 4: Implement environment parsing and the minimal app shell.**

~~~typescript
// src/lib/env.ts
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32),
  OWNER_EMAIL: z.string().email(),
  OWNER_PASSWORD_HASH: z.string().min(1),
  SCHEDULER_SECRET: z.string().min(16),
  RESEND_API_KEY: z.string().min(1),
  APP_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export function parseServerEnv(input: Record<string, unknown>) {
  return envSchema.parse(input);
}

export function serverEnv() {
  return parseServerEnv(process.env);
}
~~~

Use Inter and IBM Plex Mono through next/font/google in layout.tsx, expose the font variables, and give the protected page.tsx a white canvas with the wordmark and an explicit /login link. Define the design tokens from .superdesign/design-system.md in globals.css, including the sidebar, cobalt action, urgency colors, 4px spacing scale, 6px control radius, and visible focus ring. Implement src/lib/result.ts as the shared Result<T, E> discriminated union and src/lib/http.ts as JSON response/error helpers so route handlers have one serialization boundary.

.env.example must contain keys with safe example values and no real secrets:

~~~dotenv
DATABASE_URL=postgresql://remindly:remindly@localhost:5432/remindly
AUTH_SECRET=replace-with-at-least-32-random-characters
OWNER_EMAIL=owner@example.com
OWNER_PASSWORD_HASH=replace-with-bcrypt-hash
SCHEDULER_SECRET=replace-with-a-random-scheduler-secret
RESEND_API_KEY=re_example
APP_URL=http://localhost:3000
~~~

Add the minimal local database service to docker-compose.yml before integration tests run:

~~~yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: remindly
      POSTGRES_PASSWORD: remindly
      POSTGRES_DB: remindly
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U remindly -d remindly"]
      interval: 5s
      timeout: 5s
      retries: 10
~~~

- [ ] **Step 5: Run the foundation checks.**

~~~powershell
npm test -- tests/unit/env.test.ts tests/app/smoke.test.tsx
npm run lint
npm run build
~~~

Expected: both tests PASS, lint exits 0, and the production build completes.

- [ ] **Step 6: Commit the foundation.**

~~~powershell
git add package.json package-lock.json tsconfig.json next.config.ts vitest.config.ts playwright.config.ts .gitignore .env.example docker-compose.yml src tests
git commit -m "chore: bootstrap Remindly app and tests"
~~~

### Task 2: Implement timezone-aware domain calculations and validation

**Files:**
- Create: src/server/urgency/types.ts, src/server/urgency/calendar.ts, src/server/urgency/urgency.ts, src/server/urgency/scheduling.ts
- Create: src/server/validation/reminders.ts
- Create: tests/unit/calendar.test.ts, tests/unit/urgency.test.ts, tests/unit/scheduling.test.ts, tests/unit/reminder-validation.test.ts

**Interfaces:**
- type Urgency = 'OVERDUE' | 'URGENT' | 'SOON' | 'SAFE'.
- getLocalDate(now: Date, timezone: string): string returns YYYY-MM-DD.
- calendarDayDifference(endDate: string, now: Date, timezone: string): number returns endDate minus localToday in calendar days.
- calculateUrgency(endDate: string, now: Date, timezone: string): Urgency uses the frozen boundaries.
- calculateAlertAt(input: { endDate: string; leadDays: number; alertTime: string; timezone: string }): Date returns the UTC instant for the local alert date/time.
- reminderInputSchema validates name, endDate, leadDays, and alertTime with the exact bounds from the study: name 1-120 trimmed characters, valid calendar date, lead time in {0, 1, 3, 7, 14, 30}, and HH:mm alert time.

- [ ] **Step 1: Write boundary and DST tests before implementation.**

~~~typescript
// tests/unit/urgency.test.ts
import { describe, expect, it } from 'vitest';
import { calculateUrgency } from '@/server/urgency/urgency';

describe('calculateUrgency', () => {
  const now = new Date('2026-08-19T12:00:00.000Z');

  it.each([
    ['2026-08-18', 'OVERDUE'],
    ['2026-08-19', 'URGENT'],
    ['2026-08-22', 'URGENT'],
    ['2026-08-23', 'SOON'],
    ['2026-09-02', 'SOON'],
    ['2026-09-03', 'SAFE'],
  ])('maps %s to %s', (endDate, expected) => {
    expect(calculateUrgency(endDate, now, 'Africa/Casablanca')).toBe(expected);
  });
});
~~~

~~~typescript
// tests/unit/scheduling.test.ts
import { describe, expect, it } from 'vitest';
import { calculateAlertAt } from '@/server/urgency/scheduling';

describe('calculateAlertAt', () => {
  it('calculates the local alert instant across a Casablanca offset change', () => {
    expect(calculateAlertAt({
      endDate: '2026-04-05',
      leadDays: 1,
      alertTime: '09:30',
      timezone: 'Africa/Casablanca',
    }).toISOString()).toBe('2026-04-04T08:30:00.000Z');
  });
});
~~~

- [ ] **Step 2: Run the focused tests and observe the expected missing-module failures.**

~~~powershell
npm test -- tests/unit/urgency.test.ts tests/unit/scheduling.test.ts tests/unit/reminder-validation.test.ts
~~~

Expected: FAIL because the domain modules do not exist.

- [ ] **Step 3: Implement the smallest pure functions.**

Use formatInTimeZone and fromZonedTime from date-fns-tz; never compare elapsed milliseconds for urgency. Parse a local date/time as a wall-clock value in the configured IANA timezone, subtract leadDays from the calendar date, then convert it to a UTC Date.

~~~typescript
export function calculateUrgency(endDate: string, now: Date, timezone: string): Urgency {
  const days = calendarDayDifference(endDate, now, timezone);
  if (days < 0) return 'OVERDUE';
  if (days <= 3) return 'URGENT';
  if (days <= 14) return 'SOON';
  return 'SAFE';
}
~~~

Implement reminderInputSchema with a superRefine that rejects impossible dates such as 2026-02-30 and trims the name before returning it.

- [ ] **Step 4: Run unit tests and type checks.**

~~~powershell
npm test -- tests/unit/calendar.test.ts tests/unit/urgency.test.ts tests/unit/scheduling.test.ts tests/unit/reminder-validation.test.ts
npx tsc --noEmit
~~~

Expected: all focused tests PASS and TypeScript reports no errors.

- [ ] **Step 5: Commit the domain layer.**

~~~powershell
git add src/server/urgency src/server/validation tests/unit/calendar.test.ts tests/unit/urgency.test.ts tests/unit/scheduling.test.ts tests/unit/reminder-validation.test.ts
git commit -m "feat: add timezone-aware reminder domain rules"
~~~

### Task 3: Add PostgreSQL schema, Prisma client, and repository contracts

**Files:**
- Create: prisma/schema.prisma, prisma/seed.ts, src/server/db/client.ts, src/server/db/transaction.ts
- Create: src/server/reminders/repository.ts, src/server/notifications/repository.ts, src/server/settings/repository.ts
- Create: tests/integration/db-schema.test.ts, tests/integration/repositories.test.ts
- Modify: docker-compose.yml, .env.example

**Interfaces:**
- Prisma models and enum names match the approved spec exactly: ReminderStatus, NotificationStatus, and NotificationChannel.EMAIL.
- ReminderRepository exposes findById, listActive, create, update, and setStatus operations.
- NotificationRepository exposes createPending, cancelPendingForReminder, findDueCandidates, claimPending, markSent, markFailed, and reclaimExpiredProcessing.
- SettingsRepository exposes getSingleton and updateSingleton.
- withTransaction<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> is the only service-level transaction entry point.

- [ ] **Step 1: Start PostgreSQL locally and write schema assertions.**

~~~powershell
docker compose up -d postgres
~~~

~~~typescript
// tests/integration/db-schema.test.ts
import { describe, expect, it } from 'vitest';
import { prisma } from '@/server/db/client';

describe('database schema', () => {
  it('enforces one notification channel and schedule per reminder cycle', async () => {
    const reminder = await prisma.reminder.create({ data: {
      name: 'Schema check', endDate: new Date('2026-09-01'), alertLeadDays: 3,
      alertTime: '09:00', alertAt: new Date('2026-08-29T08:00:00.000Z'), status: 'ACTIVE',
    }});
    await prisma.notification.create({ data: {
      reminderId: reminder.id, scheduledFor: reminder.alertAt, channel: 'EMAIL',
      idempotencyKey: crypto.randomUUID(), status: 'PENDING',
    }});
    await expect(prisma.notification.create({ data: {
      reminderId: reminder.id, scheduledFor: reminder.alertAt, channel: 'EMAIL',
      idempotencyKey: crypto.randomUUID(), status: 'PENDING',
    }})).rejects.toThrow();
  });
});
~~~

- [ ] **Step 2: Run the integration test and observe the expected schema/client failure.**

~~~powershell
npm test -- tests/integration/db-schema.test.ts
~~~

Expected: FAIL because Prisma models and the generated client do not exist.

- [ ] **Step 3: Implement prisma/schema.prisma and generate the client.**

The schema must include id, name, endDate, alertLeadDays, alertTime, alertAt, status, parentReminderId, completedAt, createdAt, and updatedAt on Reminder; every notification ledger field from the spec; and the singleton settings fields. Add unique constraints on (reminderId, scheduledFor, channel) and idempotencyKey, plus indexes on (status, endDate), (status, alertAt), (parentReminderId), and (status, nextAttemptAt, scheduledFor).

~~~powershell
npx prisma generate
npx prisma migrate dev --name init
~~~

Use DateTime @db.Date for endDate, DateTime @db.Timestamptz(6) for UTC instants, and a string field for alertTime so the wall-clock value is preserved. Seed the singleton settings row with OWNER_EMAIL, timezone Africa/Casablanca, and default alert time 09:00; make the seed idempotent with upsert and never seed reminder or notification rows.

- [ ] **Step 4: Implement the singleton Prisma client and repositories.**

src/server/db/client.ts must reuse one client in development to avoid hot-reload connection growth. Repositories accept a PrismaClient or Prisma.TransactionClient, use parameterized Prisma calls, and return domain-shaped values rather than leaking route concerns.

- [ ] **Step 5: Run schema and repository tests.**

~~~powershell
npm test -- tests/integration/db-schema.test.ts tests/integration/repositories.test.ts
npx prisma validate
~~~

Expected: all integration tests PASS and Prisma validation exits 0.

- [ ] **Step 6: Commit persistence foundations.**

~~~powershell
git add prisma src/server/db src/server/reminders/repository.ts src/server/notifications/repository.ts src/server/settings/repository.ts tests/integration docker-compose.yml .env.example
git commit -m "feat: add Prisma schema and repository boundaries"
~~~

### Task 4: Implement transactional reminder lifecycle services

**Files:**
- Create: src/server/reminders/types.ts, src/server/reminders/service.ts, src/server/notifications/ledger.ts
- Create: tests/integration/reminder-lifecycle.test.ts
- Modify: src/server/urgency/scheduling.ts, src/server/reminders/repository.ts, src/server/notifications/repository.ts

**Interfaces:**
- createReminder(input: CreateReminderInput, now: Date): Promise<ReminderCycle> validates, calculates alertAt, creates the active reminder, and creates exactly one pending email row in one transaction.
- updateReminder(id: string, patch: UpdateReminderInput, now: Date): Promise<Reminder> allows only active reminders; name-only changes preserve the pending row; schedule changes cancel the old pending row and create one replacement.
- completeReminder(id: string, now: Date): Promise<Reminder> marks active reminders done and cancels all pending notifications.
- renewReminder(id: string, input: RenewalInput, now: Date): Promise<ReminderCycle> archives the source and creates the child cycle atomically for active or done sources.
- listActiveReminders(now: Date): Promise<ReminderListItem[]> returns urgency, remaining calendar days, and scheduled email display data.

- [ ] **Step 1: Write lifecycle integration tests for atomic creation and pending-ledger rules.**

~~~typescript
// tests/integration/reminder-lifecycle.test.ts
it('creates one active reminder and one pending notification atomically', async () => {
  const cycle = await service.createReminder({
    name: 'Passport renewal', endDate: '2026-12-01', leadDays: 14,
    alertTime: '09:00', timezone: 'Africa/Casablanca',
  }, new Date('2026-08-19T12:00:00.000Z'));

  expect(cycle.reminder.status).toBe('ACTIVE');
  expect(cycle.notification.status).toBe('PENDING');
  expect(await prisma.notification.count({ where: { reminderId: cycle.reminder.id } })).toBe(1);
});

it('replaces only the pending row when a schedule changes', async () => {
  const cycle = await createFixture();
  await service.updateReminder(cycle.reminder.id, { endDate: '2027-01-01' }, NOW);
  const rows = await prisma.notification.findMany({ where: { reminderId: cycle.reminder.id }, orderBy: { createdAt: 'asc' } });
  expect(rows.map((row) => row.status)).toEqual(['CANCELLED', 'PENDING']);
  expect(rows[1].scheduledFor.getTime()).not.toBe(rows[0].scheduledFor.getTime());
});
~~~

- [ ] **Step 2: Run the lifecycle tests and observe the expected service failure.**

~~~powershell
npm test -- tests/integration/reminder-lifecycle.test.ts
~~~

Expected: FAIL because the service and ledger transaction functions do not exist.

- [ ] **Step 3: Implement createReminder and the pending notification ledger.**

Inside one withTransaction callback, calculate the UTC alertAt, insert the reminder, and insert a notification with status PENDING, scheduledFor alertAt, channel EMAIL, and idempotencyKey equal to a new notification UUID. Return both records.

- [ ] **Step 4: Implement edit, done, and renewal state transitions.**

Use a transaction for each mutation. Re-read the reminder inside the transaction, reject archived edits/completion/renewal, preserve all historical SENT, FAILED, and PROCESSING rows, and only cancel pending rows. Renewal sets the source to ARCHIVED, sets parentReminderId on the child, and creates the child pending row before commit.

- [ ] **Step 5: Run the full lifecycle matrix.**

~~~powershell
npm test -- tests/integration/reminder-lifecycle.test.ts tests/unit/urgency.test.ts tests/unit/scheduling.test.ts
~~~

The matrix must cover active/done renewal, archived rejection, name-only edit, schedule edit, overdue creation, completion cancellation, and rollback when a notification insert fails.

- [ ] **Step 6: Commit reminder lifecycle behavior.**

~~~powershell
git add src/server/reminders src/server/notifications/ledger.ts src/server/urgency/scheduling.ts tests/integration/reminder-lifecycle.test.ts
git commit -m "feat: add transactional reminder lifecycle"
~~~
### Task 5: Build the reliable notification processor and email adapter

**Files:**
- Create: src/server/email/provider.ts, src/server/email/resend-provider.ts
- Create: src/server/notifications/processor.ts, src/server/notifications/recovery.ts
- Create: tests/integration/notification-processor.test.ts, tests/unit/retry-policy.test.ts
- Modify: src/server/notifications/repository.ts, src/server/notifications/ledger.ts

**Interfaces:**
- EmailProvider.send(input: { to: string; subject: string; html: string; text: string; idempotencyKey: string }): Promise<{ providerMessageId?: string }> is provider-neutral.
- calculateNextAttempt(attemptCount: number, now: Date): Date | null returns the five-attempt schedule: next run, +5m, +30m, +2h, +12h; null after attempt five.
- processDueNotifications(input: { now: Date; limit: number; provider: EmailProvider }): Promise<{ claimed: number; sent: number; failed: number; recovered: number }> claims and processes isolated rows.
- reconcileMissingPendingNotifications(now: Date): Promise<number> creates missing pending rows for active reminders whose current schedule has no notification.

- [ ] **Step 1: Write processor tests with a real fake provider and concurrent calls.**

~~~typescript
// tests/integration/notification-processor.test.ts
it('claims a due row once when two processors run concurrently', async () => {
  const notification = await createDueNotification();
  const provider = new RecordingEmailProvider();
  const [first, second] = await Promise.all([
    processDueNotifications({ now: NOW, limit: 20, provider }),
    processDueNotifications({ now: NOW, limit: 20, provider }),
  ]);

  expect(first.sent + second.sent).toBe(1);
  expect(provider.calls.filter((call) => call.idempotencyKey === notification.id)).toHaveLength(1);
});
~~~

~~~typescript
// tests/unit/retry-policy.test.ts
it('stops automatic retries after the fifth failed attempt', () => {
  expect(calculateNextAttempt(5, NOW)).toBeNull();
});
~~~

- [ ] **Step 2: Run the processor tests and observe the expected failures.**

~~~powershell
npm test -- tests/integration/notification-processor.test.ts tests/unit/retry-policy.test.ts
~~~

Expected: FAIL because the processor and retry policy are not implemented.

- [ ] **Step 3: Implement atomic claim and lease recovery.**

Claim due PENDING or retryable FAILED rows using a transaction with FOR UPDATE SKIP LOCKED or an equivalent conditional update returning claimed rows. Set PROCESSING, increment attemptCount, and set processingStartedAt in the same statement. Reclaim PROCESSING rows older than 15 minutes while retaining the same notification UUID/idempotency key.

- [ ] **Step 4: Implement send, final re-check, success, failure, and reconciliation.**

Immediately before calling the provider, re-read the reminder status and notification status. If the reminder is no longer active or the notification is cancelled, mark the claimed row cancelled and do not call the provider. On provider acceptance, set SENT, sentAt, and providerMessageId; on failure, set FAILED, lastError, and nextAttemptAt using the retry policy. A single row failure must not abort the batch. Reconciliation must use the reminder's current schedule and the unique constraint to remain safe under duplicate processor runs.

- [ ] **Step 5: Implement the Resend adapter and email copy.**

The adapter maps the provider-neutral input to Resend, passes the notification UUID as the provider idempotency key when the SDK supports it, and never logs API keys or reminder secrets. The email contains the reminder name, end date, urgency label, scheduled context, and a link to the authenticated reminder page.

- [ ] **Step 6: Run reliability tests and commit.**

~~~powershell
npm test -- tests/integration/notification-processor.test.ts tests/unit/retry-policy.test.ts tests/integration/reminder-lifecycle.test.ts
npx tsc --noEmit
git add src/server/email src/server/notifications tests/integration/notification-processor.test.ts tests/unit/retry-policy.test.ts
git commit -m "feat: add idempotent notification processor"
~~~

### Task 6: Add single-owner authentication and protected server boundaries

**Files:**
- Create: src/auth.ts, src/server/auth/config.ts, src/server/auth/require-owner.ts, src/app/login/page.tsx, src/app/login/actions.ts
- Create: src/middleware.ts, tests/unit/auth-config.test.ts, tests/e2e/auth.spec.ts
- Modify: src/app/layout.tsx, .env.example, src/lib/env.ts

**Interfaces:**
- verifyOwnerCredentials(email: string, password: string): Promise<boolean> compares the allowlisted email and deployment-provided password hash.
- requireOwner(): Promise<{ email: string }> returns the authenticated owner or redirects/throws an unauthenticated response for server handlers.
- /login is the only interactive unauthenticated page; /api/health is the only unauthenticated API.

- [ ] **Step 1: Write auth tests before adding the session implementation.**

~~~typescript
// tests/unit/auth-config.test.ts
it('rejects an email that is not the configured owner', async () => {
  await expect(verifyOwnerCredentials('other@example.com', 'password')).resolves.toBe(false);
});
~~~

~~~typescript
// tests/e2e/auth.spec.ts
test('redirects a visitor to login and protects the dashboard', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\\/login$/);
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
});
~~~

- [ ] **Step 2: Run the tests and observe the expected missing-auth failures.**

~~~powershell
npm test -- tests/unit/auth-config.test.ts
npx playwright test tests/e2e/auth.spec.ts
~~~

Expected: the unit test fails because auth functions do not exist; the E2E test cannot authenticate or protect the route yet.

- [ ] **Step 3: Implement Auth.js credentials, cookie settings, and middleware.**

Use a signed HTTP-only, secure-in-production cookie with the configured AUTH_SECRET. Compare the submitted email to OWNER_EMAIL and the password to OWNER_PASSWORD_HASH with compare from bcryptjs. Never expose the hash or session secret to client components. Middleware must redirect unauthenticated page requests to /login and return 401 for protected API requests.

- [ ] **Step 4: Implement the login page with accessible error handling.**

The form has labelled email and password inputs, a submit button with a pending state, an inline error region with role="alert", and focus restored to the first invalid field. Successful login redirects to /.

- [ ] **Step 5: Run auth tests and commit.**

~~~powershell
npm test -- tests/unit/auth-config.test.ts
npm run build
npx playwright test tests/e2e/auth.spec.ts
git add src/auth.ts src/server/auth src/app/login src/middleware.ts src/app/layout.tsx src/lib/env.ts tests/unit/auth-config.test.ts tests/e2e/auth.spec.ts .env.example
git commit -m "feat: protect Remindly with owner authentication"
~~~

### Task 7: Implement the approved application shell and UI primitives

**Files:**
- Create: src/components/layout/app-shell.tsx, src/components/layout/sidebar-nav.tsx, src/components/layout/mobile-nav.tsx, src/components/layout/page-header.tsx
- Create: src/components/ui/button.tsx, src/components/ui/field.tsx, src/components/ui/select.tsx, src/components/ui/inline-notice.tsx, src/components/ui/status-text.tsx, src/components/ui/overflow-menu.tsx, src/components/ui/drawer.tsx
- Modify: src/app/(protected)/layout.tsx, src/app/globals.css, src/app/layout.tsx
- Create: tests/app/shell.test.tsx, tests/app/drawer.test.tsx

**Interfaces:**
- AppShell({ children, activePath, ownerEmail }) renders the desktop sidebar and mobile navigation.
- Drawer({ open, title, onClose, children, initialFocusRef }) traps focus, closes on Escape, and restores focus to its trigger.
- StatusText({ urgency, label }) always renders the visible urgency word and semantic text.
- PageHeader({ title, description, action }) matches the approved page-title hierarchy.

- [ ] **Step 1: Write component tests for navigation and keyboard behavior.**

~~~typescript
// tests/app/drawer.test.tsx
import { useRef } from 'react';

it('traps focus and restores it after Escape', async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  function Fixture() {
    const triggerRef = useRef<HTMLButtonElement>(null);
    return <><button ref={triggerRef}>Open</button><Drawer open title="Add reminder" onClose={onClose} initialFocusRef={triggerRef}><button>Save</button></Drawer></>;
  }
  render(<Fixture />);
  const trigger = screen.getByRole('button', { name: 'Open' });
  await user.keyboard('{Escape}');
  expect(onClose).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(trigger);
});
~~~

~~~typescript
// tests/app/shell.test.tsx
it('marks the current navigation link and exposes the owner footer', () => {
  render(<AppShell activePath="/reminders" ownerEmail="owner@example.com"><main>content</main></AppShell>);
  expect(screen.getByRole('link', { name: 'Reminders' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByText('owner@example.com')).toBeVisible();
});
~~~

- [ ] **Step 2: Run focused tests and observe expected component failures.**

~~~powershell
npm test -- tests/app/shell.test.tsx tests/app/drawer.test.tsx
~~~

Expected: FAIL because the shell and primitives do not exist.

- [ ] **Step 3: Implement shell geometry and tokens from the approved references.**

Use a 224px dark graphite sidebar on desktop, a white fluid content canvas, 32px desktop gutters, 16px mobile gutters, 44-48px controls, 6px control radii, and 8px panel/drawer radii. Use Lucide outline icons for Dashboard, Reminders, Settings, Add, and overflow actions. Do not add gradients, decorative imagery, nested card stacks, giant radii, or emoji.

- [ ] **Step 4: Implement accessible drawer, menu, and form primitives.**

The drawer must use role="dialog", aria-modal="true", a labelled title, focus trap, Escape close, and focus restoration. Buttons must expose pending/disabled states. Fields must associate labels, descriptions, and errors with htmlFor/aria-describedby.

- [ ] **Step 5: Run component tests, lint, and commit.**

~~~powershell
npm test -- tests/app/shell.test.tsx tests/app/drawer.test.tsx
npm run lint
git add src/components 'src/app/(protected)/layout.tsx' src/app/globals.css src/app/layout.tsx tests/app
git commit -m "feat: add Remindly responsive application shell"
~~~

### Task 8: Build the Reminders page and reminder drawer workflows

**Files:**
- Create: src/components/reminders/reminder-group.tsx, src/components/reminders/reminder-row.tsx, src/components/reminders/reminder-drawer.tsx, src/components/reminders/reminders-page.tsx
- Create: src/app/(protected)/reminders/page.tsx
- Create: src/app/api/reminders/route.ts, src/app/api/reminders/[id]/route.ts, src/app/api/reminders/[id]/done/route.ts, src/app/api/reminders/[id]/renew/route.ts
- Create: src/server/reminders/presenters.ts, src/app/(protected)/reminders/actions.ts
- Create: tests/app/reminders-page.test.tsx, tests/e2e/reminders.spec.ts

**Interfaces:**
- GET /api/reminders returns { reminders: ReminderListItem[] } ordered by urgency rank then earliest endDate.
- POST /api/reminders accepts { name, endDate, leadDays, alertTime }; timezone comes from the singleton settings record.
- GET /api/reminders/:id returns one active or historical reminder with its notification history.
- PATCH /api/reminders/:id accepts the name and/or schedule fields and returns the updated reminder.
- POST /api/reminders/:id/done and /renew return the resulting cycle.
- RemindersPage({ reminders, defaultAlertTime }) renders the grouped list or the single-action empty state.

- [ ] **Step 1: Write tests for ordering, empty state, validation, and mutation refresh.**

~~~typescript
// tests/app/reminders-page.test.tsx
it('renders urgency groups in overdue-to-safe order and shows all required row fields', () => {
  render(<RemindersPage reminders={[overdue, safe, urgent]} defaultAlertTime="09:00" />);
  expect(screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent)).toEqual(['Overdue', 'Urgent', 'Safe']);
  expect(screen.getByText('Passport renewal')).toBeVisible();
  expect(screen.getByText(/scheduled email/i)).toBeVisible();
});

it('uses one Add reminder action for an empty state', () => {
  render(<RemindersPage reminders={[]} defaultAlertTime="09:00" />);
  expect(screen.getByRole('button', { name: /add reminder/i })).toBeVisible();
});
~~~

- [ ] **Step 2: Run focused tests and observe expected failures.**

~~~powershell
npm test -- tests/app/reminders-page.test.tsx
~~~

Expected: FAIL because the page, presenters, and route handlers do not exist.

- [ ] **Step 3: Implement server presenters and authenticated route handlers.**

Handlers must call requireOwner, parse Zod input, call the reminder service, return compact JSON, and map validation/conflict/not-found errors to 400, 409, and 404 responses. They must never calculate urgency or mutate notifications directly.

- [ ] **Step 4: Implement grouped rows and the add/edit drawer.**

Show Name, End date, relative time, and scheduled email date/time in every row. Render both the urgency rail and visible urgency text. The drawer contains only Name, End date, Remind me, and At. Lead-time choices are Same day, 1 day before, 3 days before, 7 days before, 14 days before, and 30 days before. Warn, but do not block, an overdue date whose alert instant is already past.

- [ ] **Step 5: Implement row actions and refresh behavior.**

Edit opens the drawer with existing values; Mark done confirms the mutation and removes the reminder from active groups after refresh; Renew opens the new-cycle form and shows the resulting child cycle; unknown errors preserve form values and display an inline role="alert" message.

- [ ] **Step 6: Run page tests, E2E flow, and commit.**

~~~powershell
npm test -- tests/app/reminders-page.test.tsx
npx playwright test tests/e2e/reminders.spec.ts
npm run lint
git add src/components/reminders 'src/app/(protected)/reminders' src/app/api/reminders src/server/reminders/presenters.ts tests/app/reminders-page.test.tsx tests/e2e/reminders.spec.ts
git commit -m "feat: add reminder management workflows"
~~~
### Task 9: Implement settings and atomic timezone rescheduling

**Files:**
- Create: src/server/settings/service.ts, src/server/settings/types.ts
- Create: src/app/api/settings/route.ts, src/app/(protected)/settings/page.tsx, src/components/settings/settings-page.tsx, src/components/settings/settings-section.tsx
- Create: tests/integration/settings-timezone.test.ts, tests/app/settings-page.test.tsx, tests/e2e/settings.spec.ts
- Modify: src/server/reminders/service.ts, src/server/notifications/ledger.ts, src/app/(protected)/layout.tsx

**Interfaces:**
- getSettings(): Promise<OwnerSettings> returns email, IANA timezone, default alert time, and protected access status.
- updateSettings(input: UpdateSettingsInput): Promise<OwnerSettings> validates the email/timezone/time and atomically updates settings while replacing pending schedules for active reminders.
- GET /api/settings and PATCH /api/settings are authenticated and return no password or secret fields.
- SettingsPage({ settings }) renders notification email, timezone, default alert time, protected-access status, Save, Cancel, and inline feedback.

- [ ] **Step 1: Write the atomic timezone test and UI test.**

~~~typescript
// tests/integration/settings-timezone.test.ts
it('recalculates active pending schedules and preserves sent history', async () => {
  const active = await createActiveReminderWithPending('Africa/Casablanca');
  const sent = await createSentReminder('Africa/Casablanca');
  await settingsService.updateSettings({ timezone: 'Europe/London' });
  const pending = await prisma.notification.findMany({ where: { reminderId: active.id }, orderBy: { createdAt: 'asc' } });
  expect(pending.map((row) => row.status)).toEqual(['CANCELLED', 'PENDING']);
  expect(await prisma.notification.count({ where: { reminderId: sent.id, status: 'SENT' } })).toBe(1);
});
~~~

~~~typescript
// tests/app/settings-page.test.tsx
it('shows protected access as read-only status', () => {
  render(<SettingsPage settings={{ notificationEmail: 'owner@example.com', timezone: 'Africa/Casablanca', defaultAlertTime: '09:00', protectedAccess: true }} />);
  expect(screen.getByText(/protected access/i)).toBeVisible();
  expect(screen.queryByRole('textbox', { name: /password/i })).not.toBeInTheDocument();
});
~~~

- [ ] **Step 2: Run focused tests and observe expected failures.**

~~~powershell
npm test -- tests/integration/settings-timezone.test.ts tests/app/settings-page.test.tsx
~~~

Expected: FAIL because settings service, UI, and route do not exist.

- [ ] **Step 3: Implement validation and atomic settings service.**

Validate email with Zod, timezone with Intl.DateTimeFormat(undefined, { timeZone }), and alert time with the shared time schema. In one transaction, update the singleton settings, cancel each active reminder's pending row, calculate the new instant with the new timezone, and insert the replacement. If any operation fails, the old settings and rows remain committed unchanged.

- [ ] **Step 4: Implement the Settings page and route.**

Use the default alert time only to initialize new-reminder forms. Keep protected-access status read-only and display the owner email without exposing password data. Save shows inline success; Cancel restores the server-loaded values; invalid input preserves all edits and focuses the first invalid field.

- [ ] **Step 5: Run tests, E2E settings flow, and commit.**

~~~powershell
npm test -- tests/integration/settings-timezone.test.ts tests/app/settings-page.test.tsx
npx playwright test tests/e2e/settings.spec.ts
git add src/server/settings src/app/api/settings 'src/app/(protected)/settings' src/components/settings tests/integration/settings-timezone.test.ts tests/app/settings-page.test.tsx tests/e2e/settings.spec.ts
git commit -m "feat: add owner settings and timezone rescheduling"
~~~

### Task 10: Implement the dashboard aggregates and accessible charts

**Files:**
- Create: src/server/dashboard/queries.ts, src/server/dashboard/types.ts
- Create: src/app/api/dashboard/route.ts, src/components/dashboard/summary-strip.tsx, src/components/dashboard/attention-list.tsx, src/components/dashboard/urgency-donut.tsx, src/components/dashboard/completed-renewed-chart.tsx, src/components/dashboard/deadline-timeline.tsx, src/components/dashboard/dashboard-page.tsx
- Modify: src/app/(protected)/page.tsx, src/app/(protected)/layout.tsx
- Create: tests/integration/dashboard-queries.test.ts, tests/app/dashboard-page.test.tsx, tests/e2e/dashboard.spec.ts

**Interfaces:**
- getDashboardData(now: Date): Promise<DashboardData> returns summary, attention, urgencyCounts, completedVsRenewed, and nextThirtyDays.
- GET /api/dashboard requires owner auth and returns the same compact serialized shape.
- DashboardPage({ data }) renders the summary strip, Needs attention list, urgency donut, Completed vs renewed chart, and Next 30 days timeline.

- [ ] **Step 1: Write aggregate boundary tests.**

~~~typescript
// tests/integration/dashboard-queries.test.ts
it('counts due-in-seven-days without counting overdue reminders', async () => {
  await seedReminder({ status: 'ACTIVE', endDate: '2026-08-18' });
  await seedReminder({ status: 'ACTIVE', endDate: '2026-08-22' });
  await seedReminder({ status: 'ACTIVE', endDate: '2026-09-03' });
  const data = await getDashboardData(new Date('2026-08-19T12:00:00.000Z'));
  expect(data.summary.overdue).toBe(1);
  expect(data.summary.dueInSevenDays).toBe(1);
});

it('counts sent emails by the owner local calendar month', async () => {
  await seedSentNotification('2026-08-01T00:30:00.000Z');
  await seedSentNotification('2026-07-31T22:30:00.000Z');
  const data = await getDashboardData(new Date('2026-08-19T12:00:00.000Z'));
  expect(data.summary.sentThisMonth).toBe(1);
});
~~~

- [ ] **Step 2: Run aggregate tests and observe the expected query failure.**

~~~powershell
npm test -- tests/integration/dashboard-queries.test.ts tests/app/dashboard-page.test.tsx
~~~

Expected: FAIL because the dashboard query and components do not exist.

- [ ] **Step 3: Implement compact PostgreSQL-backed dashboard queries.**

Use SQL/Prisma aggregation for counts; do not load all reminders into the browser. The summary contains active reminders, overdue active reminders, active reminders due in local calendar days 0-7 excluding overdue, and SENT notifications whose sentAt falls inside the owner's local calendar month. Derive urgency from active reminders in the configured timezone. The six-month comparison counts DONE reminders and child reminders with non-null parentReminderId by local calendar month. The thirty-day timeline includes active reminders from today through today plus 30 days and places current overdue reminders at the timeline start.

- [ ] **Step 4: Implement charts with text summaries and data tables.**

Use Recharts only in client chart components. Each chart panel must have a heading, visible legend, accessible name, screen-reader summary, and a visually-hidden or expandable data table. On mobile, render Needs attention and the summary strip before historical charts. Use the design-system colors and no decorative chart effects.

- [ ] **Step 5: Implement dashboard page and route, then run checks.**

~~~powershell
npm test -- tests/integration/dashboard-queries.test.ts tests/app/dashboard-page.test.tsx
npx playwright test tests/e2e/dashboard.spec.ts
npm run build
git add src/server/dashboard src/app/api/dashboard 'src/app/(protected)/page.tsx' src/components/dashboard tests/integration/dashboard-queries.test.ts tests/app/dashboard-page.test.tsx tests/e2e/dashboard.spec.ts
git commit -m "feat: add operational dashboard analytics"
~~~

### Task 11: Add health, scheduler deployment, and end-to-end acceptance coverage

**Files:**
- Create: src/app/api/health/route.ts, .github/workflows/process-due-notifications.yml, README.md
- Modify: src/app/api/internal/process-due-notifications/route.ts, playwright.config.ts, docker-compose.yml, .env.example
- Create: tests/e2e/mvp-acceptance.spec.ts, tests/e2e/accessibility.spec.ts

**Interfaces:**
- GET /api/health returns { status: 'ok' | 'degraded', database: 'ok' | 'error' } without reminder contents or credentials.
- POST /api/internal/process-due-notifications requires a timing-safe x-scheduler-secret comparison and returns processor counts.
- The GitHub Actions workflow runs the internal endpoint every 5-15 minutes and fails visibly on non-2xx responses.

- [ ] **Step 1: Write the full acceptance scenario before wiring deployment checks.**

~~~typescript
// tests/e2e/mvp-acceptance.spec.ts
test('owner completes the reminder lifecycle', async ({ page }) => {
  await loginAsOwner(page);
  await page.goto('/reminders');
  await page.getByRole('button', { name: /add reminder/i }).click();
  await page.getByLabel('Name').fill('Passport renewal');
  await page.getByLabel('End date').fill('2026-12-01');
  await page.getByLabel('Remind me').selectOption('14');
  await page.getByLabel('At').fill('09:00');
  await page.getByRole('button', { name: /save reminder/i }).click();
  await expect(page.getByText('Passport renewal')).toBeVisible();
  await expect(page.getByText(/safe/i)).toBeVisible();
  await page.getByRole('button', { name: /mark done/i }).click();
  await expect(page.getByText('Passport renewal')).not.toBeVisible();
});
~~~

- [ ] **Step 2: Run the acceptance test and observe the expected missing-route/deployment failures.**

~~~powershell
npx playwright test tests/e2e/mvp-acceptance.spec.ts tests/e2e/accessibility.spec.ts
~~~

Expected: FAIL until health, scheduler, all page routes, seeded test auth, and accessibility assertions are complete.

- [ ] **Step 3: Implement health and scheduler route protection.**

Use crypto.timingSafeEqual against equal-length buffers for the scheduler secret. The endpoint calls processDueNotifications with a bounded batch, logs sanitized identifiers, and returns counts. Health checks the database connection and never returns provider keys or reminder names.

- [ ] **Step 4: Add Docker and scheduled workflow documentation.**

docker-compose.yml must provide PostgreSQL with a named volume and health check. The workflow must use repository secrets for APP_URL and SCHEDULER_SECRET, invoke the endpoint every ten minutes with cron */10 * * * *, and fail on HTTP errors. README.md must document local setup, migrations, test commands, owner secret generation, and the processor contract.

- [ ] **Step 5: Run the complete verification suite.**

~~~powershell
npm test
npm run lint
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
~~~

Expected: unit, integration, component, E2E, lint, and build checks all pass with no unhandled warnings.

- [ ] **Step 6: Commit operations and acceptance coverage.**

~~~powershell
git add src/app/api/health src/app/api/internal/process-due-notifications .github/workflows README.md docker-compose.yml .env.example playwright.config.ts tests/e2e
git commit -m "test: add MVP acceptance and scheduler operations"
~~~

### Task 12: Perform browser-first visual QA and final verification

**Files:**
- Modify only the implementation files that fail visual or accessibility verification.
- Create: docs/verification/remindly-visual-qa.md

**Interfaces:**
- QA captures /, /reminders, the open add/edit drawer, /settings, and the mobile equivalents.
- QA records viewport, browser availability, screenshot paths, comparison observations, accessibility results, and any fixes.

- [ ] **Step 1: Start the production build and inspect with the in-app Browser.**

~~~powershell
npm run build
npm start
~~~

Open the local app in the in-app Browser first. If no in-app Browser is available, record in-app Browser unavailable in the QA report before using Playwright.

- [ ] **Step 2: Capture reference-comparison screenshots.**

Capture desktop at 1440px width and mobile at 390px width for Dashboard, Reminders, open drawer, and Settings. Compare against:

~~~
docs/design/references/remindly-dashboard.png
docs/design/references/remindly-reminders.png
docs/design/references/remindly-settings.png
~~~

Check sidebar width, typography, whitespace, borders, semantic rails, chart labels, action placement, drawer behavior, and mobile navigation. Correct only implementation drift from the approved design system.

- [ ] **Step 3: Run keyboard and reduced-motion checks.**

Verify keyboard navigation for sidebar links, row menus, drawer open/close, form fields, Save/Cancel, and chart summaries. Verify focus visibility, Escape behavior, focus restoration, prefers-reduced-motion, and text labels for all urgency colors.

- [ ] **Step 4: Write the QA report and run final verification.**

~~~markdown
# Remindly Visual QA

- Browser: in-app Browser or Playwright fallback
- Viewports: 1440px desktop, 390px mobile
- Routes checked: /, /reminders, /settings, open reminder drawer
- Accessibility: keyboard, focus, reduced motion, chart text fallback
- Result: PASS
~~~

~~~powershell
git diff --check
git status --short
npm test
npm run lint
npm run build
npm run test:e2e
~~~

- [ ] **Step 5: Commit only verified fixes and the QA report.**

~~~powershell
git add src docs/verification/remindly-visual-qa.md
git commit -m "chore: verify Remindly MVP UI and acceptance flow"
~~~

## Spec Coverage Checklist

- Goal and one-owner product promise: Tasks 1, 6, 8, 11.
- Approved Dashboard, Reminders, Settings visual direction: Tasks 7-10 and 12.
- Reminder CRUD, urgency, alert calculation, edit, done, renewal: Tasks 2 and 4, surfaced by Task 8.
- Transactional notification ledger, atomic claims, leases, retry, recovery, provider idempotency: Tasks 3-5 and 11.
- Timezone settings and pending schedule replacement: Task 9.
- Derived dashboard metrics with no analytics table: Task 10.
- Protected access and scheduler secret: Tasks 6 and 11.
- WCAG 2.2 AA, responsive layout, focus, chart alternatives: Tasks 7, 8, 9, 10, and 12.
- Unit, integration, E2E, visual QA, build, and deployment verification: Tasks 1-12.

## Execution Handoff

The plan is complete and saved to docs/superpowers/plans/2026-08-19-remindly-mvp.md. At execution time, create an isolated worktree with superpowers:using-git-worktrees, then use either superpowers:subagent-driven-development (recommended, one fresh worker per task with review checkpoints) or superpowers:executing-plans (inline execution with batch checkpoints). Every production behavior change follows the red-green-refactor loop from superpowers:test-driven-development.
