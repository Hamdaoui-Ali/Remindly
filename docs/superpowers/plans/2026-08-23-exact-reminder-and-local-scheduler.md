# Exact Reminder and Local Scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add exact custom reminder dates and automatically submit locally due email notifications to Resend within approximately one minute.

**Architecture:** Preserve the existing database model by normalizing a custom reminder date into a non-negative calendar-day lead value and continuing to treat `alertAt` as the exact delivery instant. Add a standalone, tested scheduler client and a 30-second local worker process that calls the existing protected notification endpoint alongside `next dev`.

**Tech Stack:** Next.js 16.3.1 App Router, React 19.2.8, TypeScript 6.0.3, Zod 4.4.3, date-fns 4.4.0, date-fns-tz 3.2.0, Vitest 4.1.11, Prisma 7.9.1, Resend 6.20.0, `@next/env` 16.3.1, concurrently 10.0.5.

**Spec:** `docs/superpowers/specs/2026-08-23-exact-reminder-and-local-scheduler-design.md`

## Global Constraints

- Read `AGENTS.md` and the relevant installed Next.js 16.3.1 guides before writing code: `node_modules/next/dist/docs/01-app/02-guides/local-development.md` and `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`.
- A custom reminder date must be on or before the task end date.
- Accept integer `leadDays` values from 0 through 36,500; reject negative, fractional, and larger values.
- Keep `alertAt` as the exact UTC source of truth calculated in the singleton settings timezone.
- Do not change the Prisma schema or create a database migration.
- Poll locally every 30 seconds; the one-minute goal covers Remindly's submission attempt, not inbox arrival.
- Never log secrets, recipient addresses, reminder names, provider errors, email subjects, or message bodies.
- Keep the existing processor endpoint authentication, bounded batches, retry policy, leases, and provider idempotency unchanged.
- Preserve unrelated working-tree changes. Stage and commit only files listed by each task.
- Follow strict red-green-refactor TDD: every production behavior starts with a test that is run and observed failing for the expected reason.

## File Structure

- `src/server/urgency/scheduling.ts`: pure calendar conversion between end date, reminder date, lead days, and timezone-aware `alertAt`.
- `src/server/validation/reminders.ts`: authoritative bounded-integer reminder validation.
- `src/server/reminders/types.ts`: API/service types widened from preset literals to bounded runtime-validated numbers.
- `src/components/reminders/reminder-drawer.tsx`: preset/custom form state, custom-date validation, and request normalization.
- `src/server/notifications/scheduler-client.ts`: one read-only health check plus one authenticated processor request, represented as sanitized result types.
- `src/server/notifications/local-worker.ts`: validated worker configuration and the testable 30-second polling loop.
- `scripts/local-notification-worker.ts`: environment loading, 30-second loop, signal handling, and sanitized logging.
- `package.json` and `package-lock.json`: worker dependencies and unified local development scripts.
- `README.md`: local scheduler behavior, commands, and one-minute boundary.
- Existing unit, component, integration, and app-route tests remain in their current test folders.

---

### Task 1: Normalize Arbitrary Custom Reminder Dates

**Files:**
- Modify: `src/server/urgency/scheduling.ts:1-16`
- Modify: `src/server/validation/reminders.ts:1-27`
- Modify: `src/server/reminders/types.ts:1-21`
- Test: `tests/unit/scheduling.test.ts`
- Test: `tests/unit/reminder-validation.test.ts`
- Test: `tests/integration/reminder-lifecycle.test.ts`

**Interfaces:**
- Produces: `calculateLeadDays(endDate: string, reminderDate: string): number`
- Produces: `calculateReminderDate(endDate: string, leadDays: number): string`
- Preserves: `calculateAlertAt(input: AlertScheduleInput): Date`
- Produces: `MAX_ALERT_LEAD_DAYS = 36_500`
- Changes: `CreateReminderInput.leadDays` and `UpdateReminderInput.leadDays` to `number`; Zod remains the runtime authority.

- [ ] **Step 1: Add failing calendar-normalization tests**

Append focused cases to `tests/unit/scheduling.test.ts`:

```ts
import {
  calculateAlertAt,
  calculateLeadDays,
  calculateReminderDate,
} from '@/server/urgency/scheduling';

it('converts an exact reminder date to calendar lead days', () => {
  expect(calculateLeadDays('2026-08-26', '2026-08-23')).toBe(3);
  expect(calculateLeadDays('2028-03-01', '2028-02-29')).toBe(1);
});

it('reconstructs custom dates across month and leap-year boundaries', () => {
  expect(calculateReminderDate('2026-03-01', 2)).toBe('2026-02-27');
  expect(calculateReminderDate('2028-03-01', 1)).toBe('2028-02-29');
});

it('rejects a reminder date after the end date', () => {
  expect(() => calculateLeadDays('2026-08-23', '2026-08-24'))
    .toThrow('Reminder date must be on or before the end date');
});
```

- [ ] **Step 2: Run the scheduling tests and observe RED**

Run:

```powershell
npx vitest run tests/unit/scheduling.test.ts --maxWorkers=1
```

Expected: FAIL because `calculateLeadDays` and `calculateReminderDate` are not exported.

- [ ] **Step 3: Implement the minimal pure calendar helpers**

Replace duplicated date subtraction in `src/server/urgency/scheduling.ts` with UTC calendar arithmetic:

```ts
import { fromZonedTime } from 'date-fns-tz';
import { isValidCalendarDate } from './calendar';

const MILLISECONDS_PER_DAY = 86_400_000;

function calendarDateMilliseconds(value: string): number {
  if (!isValidCalendarDate(value)) throw new Error('Invalid calendar date');
  return Date.UTC(
    Number(value.slice(0, 4)),
    Number(value.slice(5, 7)) - 1,
    Number(value.slice(8, 10)),
  );
}

export function calculateLeadDays(endDate: string, reminderDate: string): number {
  const difference = (calendarDateMilliseconds(endDate) - calendarDateMilliseconds(reminderDate))
    / MILLISECONDS_PER_DAY;
  if (difference < 0) throw new Error('Reminder date must be on or before the end date');
  return difference;
}

export function calculateReminderDate(endDate: string, leadDays: number): string {
  if (!Number.isInteger(leadDays) || leadDays < 0) throw new Error('Invalid alert lead days');
  return new Date(calendarDateMilliseconds(endDate) - leadDays * MILLISECONDS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

export function calculateAlertAt(input: AlertScheduleInput): Date {
  const alertDate = calculateReminderDate(input.endDate, input.leadDays);
  return fromZonedTime(`${alertDate}T${input.alertTime}:00`, input.timezone);
}
```

- [ ] **Step 4: Run the scheduling tests and observe GREEN**

Run:

```powershell
npx vitest run tests/unit/scheduling.test.ts --maxWorkers=1
```

Expected: all scheduling tests PASS, including the existing Casablanca offset test.

- [ ] **Step 5: Add failing bounded-integer validation tests**

Update `tests/unit/reminder-validation.test.ts` so a non-preset value succeeds and invalid numeric values fail:

```ts
it('accepts a non-preset custom calendar lead', () => {
  expect(reminderInputSchema.parse({ ...valid, leadDays: 2 }).leadDays).toBe(2);
});

it.each([-1, 1.5, 36_501])('rejects an invalid calendar lead of %s days', (leadDays) => {
  expect(reminderInputSchema.safeParse({ ...valid, leadDays }).success).toBe(false);
});
```

Remove the existing fixture that treats `leadDays: 2` as invalid.

- [ ] **Step 6: Run validation tests and observe RED**

Run:

```powershell
npx vitest run tests/unit/reminder-validation.test.ts --maxWorkers=1
```

Expected: FAIL because the existing literal union rejects `leadDays: 2`.

- [ ] **Step 7: Widen runtime validation and TypeScript service inputs**

In `src/server/validation/reminders.ts`:

```ts
export const MAX_ALERT_LEAD_DAYS = 36_500;
export const alertLeadDaysSchema = z.number().int().min(0).max(MAX_ALERT_LEAD_DAYS);

const reminderFields = z.object({
  name: z.string().trim().min(1).max(120),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  leadDays: alertLeadDaysSchema,
  alertTime: alertTimeSchema,
});
```

In `src/server/reminders/types.ts`, change both lead-day properties to numbers:

```ts
export interface CreateReminderInput {
  name: string;
  endDate: string;
  leadDays: number;
  alertTime: string;
  timezone?: string;
}

export interface UpdateReminderInput {
  name?: string;
  endDate?: string;
  leadDays?: number;
  alertTime?: string;
}
```

- [ ] **Step 8: Run validation tests and observe GREEN**

Run:

```powershell
npx vitest run tests/unit/reminder-validation.test.ts tests/unit/scheduling.test.ts --maxWorkers=1
```

Expected: both files PASS.

- [ ] **Step 9: Add an integration regression for a non-preset schedule**

In `tests/integration/reminder-lifecycle.test.ts`, widen the fixture override so it matches `CreateReminderInput`:

```ts
function input(name: string, overrides: Partial<{
  endDate: string;
  leadDays: number;
  alertTime: string;
  timezone: string;
}> = {}) {
```

Then add the regression through `createFixture`, which registers the generated reminder name for suite cleanup:

```ts
it('creates an exact notification for a non-preset calendar lead', async () => {
  const cycle = await createFixture({
    endDate: '2026-03-24',
    leadDays: 2,
    alertTime: '09:30',
  });

  expect(cycle.reminder.alertLeadDays).toBe(2);
  expect(cycle.reminder.alertAt.toISOString()).toBe('2026-03-22T08:30:00.000Z');
  expect(cycle.notification.scheduledFor).toEqual(cycle.reminder.alertAt);
});
```

- [ ] **Step 10: Run the integration test and confirm it passes through the real lifecycle**

Run:

```powershell
npx vitest run tests/integration/reminder-lifecycle.test.ts --maxWorkers=1
```

Expected: PASS. This is a regression test for the widened service contract; production behavior is already supplied by the normalized schedule path.

- [ ] **Step 11: Commit Task 1**

```powershell
git add src/server/urgency/scheduling.ts src/server/validation/reminders.ts src/server/reminders/types.ts tests/unit/scheduling.test.ts tests/unit/reminder-validation.test.ts tests/integration/reminder-lifecycle.test.ts
git commit -m "feat: support arbitrary reminder lead days"
```

---

### Task 2: Add the Custom Date and Time Form Option

**Files:**
- Modify: `src/components/reminders/reminder-drawer.tsx:1-181`
- Test: `tests/app/reminders-page.test.tsx`

**Interfaces:**
- Consumes: `calculateLeadDays(endDate, reminderDate)` from Task 1.
- Consumes: `calculateReminderDate(endDate, leadDays)` from Task 1.
- Sends the unchanged API shape `{ name, endDate, leadDays: number, alertTime }`.
- Produces client-only selector value `custom`; it is never sent as `leadDays`.

- [ ] **Step 1: Add failing component tests for custom mode**

Add these behaviors to `tests/app/reminders-page.test.tsx`:

```tsx
it('reveals an exact reminder date when Custom is selected', async () => {
  const user = userEvent.setup();
  render(<RemindersPage reminders={[]} defaultAlertTime="09:00" />);

  await user.click(screen.getByRole('button', { name: /add reminder/i }));
  await user.selectOptions(screen.getByLabelText('Remind me'), 'custom');

  expect(screen.getByLabelText('Reminder date')).toHaveAttribute('type', 'date');
});

it('blocks a custom reminder date after the end date', async () => {
  const request = vi.fn();
  vi.stubGlobal('fetch', request);
  const user = userEvent.setup();
  render(<RemindersPage reminders={[]} defaultAlertTime="09:00" />);

  await user.click(screen.getByRole('button', { name: /add reminder/i }));
  await user.type(screen.getByLabelText('Name'), 'Invalid custom date');
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-08-23' } });
  await user.selectOptions(screen.getByLabelText('Remind me'), 'custom');
  fireEvent.change(screen.getByLabelText('Reminder date'), { target: { value: '2026-08-24' } });
  await user.click(screen.getByRole('button', { name: /save reminder/i }));

  expect(screen.getByText('Reminder date must be on or before the end date.')).toBeVisible();
  expect(request).not.toHaveBeenCalled();
});

it('submits a custom date as its calendar-day lead', async () => {
  const request = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ cycle: { reminder: reminder({ leadDays: 2 }) } }),
  });
  vi.stubGlobal('fetch', request);
  const user = userEvent.setup();
  render(<RemindersPage reminders={[]} defaultAlertTime="09:00" />);

  await user.click(screen.getByRole('button', { name: /add reminder/i }));
  await user.type(screen.getByLabelText('Name'), 'Two days before');
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-08-26' } });
  await user.selectOptions(screen.getByLabelText('Remind me'), 'custom');
  fireEvent.change(screen.getByLabelText('Reminder date'), { target: { value: '2026-08-24' } });
  fireEvent.change(screen.getByLabelText('At'), { target: { value: '10:15' } });
  await user.click(screen.getByRole('button', { name: /save reminder/i }));

  const body = JSON.parse(request.mock.calls[0]?.[1]?.body as string);
  expect(body).toMatchObject({ endDate: '2026-08-26', leadDays: 2, alertTime: '10:15' });
});

it('reopens a non-preset lead as its exact custom date', async () => {
  const user = userEvent.setup();
  render(<RemindersPage reminders={[reminder({ endDate: '2026-08-26', leadDays: 2 })]} defaultAlertTime="09:00" />);

  await user.click(screen.getByRole('button', { name: /actions for passport renewal/i }));
  await user.click(screen.getByRole('button', { name: 'Edit' }));

  expect(screen.getByLabelText('Remind me')).toHaveValue('custom');
  expect(screen.getByLabelText('Reminder date')).toHaveValue('2026-08-24');
});
```

- [ ] **Step 2: Run the component tests and observe RED**

Run:

```powershell
npx vitest run tests/app/reminders-page.test.tsx --maxWorkers=1
```

Expected: FAIL because there is no `custom` option or `Reminder date` input.

- [ ] **Step 3: Add custom form state and normalization**

In `src/components/reminders/reminder-drawer.tsx`:

```ts
import {
  calculateAlertAt,
  calculateLeadDays,
  calculateReminderDate,
} from '@/server/urgency/scheduling';

const CUSTOM_LEAD_DAYS = 'custom';
const PRESET_LEAD_DAYS = new Set(['0', '1', '3', '7', '14', '30']);

type FormValues = {
  name: string;
  endDate: string;
  leadDays: string;
  customAlertDate: string;
  alertTime: string;
};

function selectedLeadDays(values: FormValues): number {
  return values.leadDays === CUSTOM_LEAD_DAYS
    ? calculateLeadDays(values.endDate, values.customAlertDate)
    : Number(values.leadDays);
}
```

Add `['custom', 'Custom date and time']` to the selector options. Initialize edit/renew values as follows:

```ts
const storedLeadDays = String(reminder.alertLeadDays);
const preset = PRESET_LEAD_DAYS.has(storedLeadDays);
return {
  name: reminder.name,
  endDate: reminder.endDate,
  leadDays: preset ? storedLeadDays : CUSTOM_LEAD_DAYS,
  customAlertDate: preset
    ? ''
    : calculateReminderDate(reminder.endDate, reminder.alertLeadDays),
  alertTime: reminder.alertTime,
};
```

Initialize add mode with `customAlertDate: ''`.

- [ ] **Step 4: Add custom-date validation and rendering**

Extend `validates`:

```ts
if (values.leadDays === CUSTOM_LEAD_DAYS) {
  if (!values.customAlertDate) {
    errors.customAlertDate = 'Choose a reminder date.';
  } else if (values.endDate) {
    try {
      calculateLeadDays(values.endDate, values.customAlertDate);
    } catch {
      errors.customAlertDate = 'Reminder date must be on or before the end date.';
    }
  }
}
```

Render the conditional field immediately below `Remind me`:

```tsx
{values.leadDays === CUSTOM_LEAD_DAYS ? (
  <Field
    htmlFor="reminder-custom-alert-date"
    label="Reminder date"
    error={errors.customAlertDate}
  >
    <input
      id="reminder-custom-alert-date"
      name="customAlertDate"
      type="date"
      value={values.customAlertDate}
      onChange={(event) => update('customAlertDate', event.target.value)}
    />
  </Field>
) : null}
```

Use `selectedLeadDays(values)` in `alertAlreadyDue` and in the request body. Remove the fixed literal type assertion:

```ts
const body = {
  name: values.name.trim(),
  endDate: values.endDate,
  leadDays: selectedLeadDays(values),
  alertTime: values.alertTime,
};
```

- [ ] **Step 5: Run component tests and observe GREEN**

Run:

```powershell
npx vitest run tests/app/reminders-page.test.tsx --maxWorkers=1
```

Expected: all reminder-page tests PASS.

- [ ] **Step 6: Run route and lifecycle regressions**

Run:

```powershell
npx vitest run tests/app/reminder-routes.test.ts tests/integration/reminder-lifecycle.test.ts --maxWorkers=1
```

Expected: PASS with the unchanged HTTP request shape and ledger replacement behavior.

- [ ] **Step 7: Commit Task 2**

```powershell
git add src/components/reminders/reminder-drawer.tsx tests/app/reminders-page.test.tsx
git commit -m "feat: add custom reminder date option"
```

---

### Task 3: Build a Sanitized Scheduler Client

**Files:**
- Create: `src/server/notifications/scheduler-client.ts`
- Create: `tests/unit/scheduler-client.test.ts`

**Interfaces:**
- Produces: `ProcessorCounts`
- Produces: `SchedulerCycleResult`
- Produces: `runSchedulerCycle(input: SchedulerCycleInput): Promise<SchedulerCycleResult>`
- Produces: `formatSchedulerCycleResult(result: SchedulerCycleResult): string`
- Consumes: a fetch-compatible function injected as `fetchImpl` for deterministic tests.

- [ ] **Step 1: Write failing scheduler boundary tests**

Create `tests/unit/scheduler-client.test.ts` with real `Response` objects:

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  formatSchedulerCycleResult,
  runSchedulerCycle,
} from '@/server/notifications/scheduler-client';

const input = {
  appUrl: 'http://localhost:3000',
  schedulerSecret: 'scheduler-secret-123456',
};

it('checks health before processing and returns aggregate counts', async () => {
  const fetchImpl = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'ok', database: 'ok' }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ claimed: 1, sent: 1, failed: 0, recovered: 0 }), { status: 200 }));

  await expect(runSchedulerCycle({ ...input, fetchImpl })).resolves.toEqual({
    kind: 'processed',
    status: 200,
    counts: { claimed: 1, sent: 1, failed: 0, recovered: 0 },
  });
  expect(fetchImpl).toHaveBeenNthCalledWith(1, 'http://localhost:3000/api/health', expect.objectContaining({ method: 'GET' }));
  expect(fetchImpl).toHaveBeenNthCalledWith(2, 'http://localhost:3000/api/internal/process-due-notifications', expect.objectContaining({
    method: 'POST',
    headers: { 'x-scheduler-secret': input.schedulerSecret },
  }));
});

it('does not process while health is unavailable', async () => {
  const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
  await expect(runSchedulerCycle({ ...input, fetchImpl })).resolves.toEqual({ kind: 'not-ready', status: 503 });
  expect(fetchImpl).toHaveBeenCalledOnce();
});

it('returns a sanitized rejection without parsing the provider body', async () => {
  const fetchImpl = vi.fn()
    .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    .mockResolvedValueOnce(new Response('secret provider details', { status: 401 }));
  const result = await runSchedulerCycle({ ...input, fetchImpl });
  expect(result).toEqual({ kind: 'rejected', status: 401 });
  expect(formatSchedulerCycleResult(result)).toBe('processor rejected status=401');
  expect(formatSchedulerCycleResult(result)).not.toContain('secret');
});

it('handles network and malformed-response failures without throwing', async () => {
  const unavailable = vi.fn().mockRejectedValue(new Error('connection includes private data'));
  await expect(runSchedulerCycle({ ...input, fetchImpl: unavailable })).resolves.toEqual({ kind: 'unavailable' });

  const malformed = vi.fn()
    .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    .mockResolvedValueOnce(new Response('{}', { status: 200 }));
  await expect(runSchedulerCycle({ ...input, fetchImpl: malformed })).resolves.toEqual({ kind: 'invalid-response', status: 200 });
});
```

- [ ] **Step 2: Run the scheduler-client tests and observe RED**

Run:

```powershell
npx vitest run tests/unit/scheduler-client.test.ts --maxWorkers=1
```

Expected: FAIL because `scheduler-client.ts` does not exist.

- [ ] **Step 3: Implement result types and one bounded cycle**

Create `src/server/notifications/scheduler-client.ts`:

```ts
export interface ProcessorCounts {
  claimed: number;
  sent: number;
  failed: number;
  recovered: number;
}

export type SchedulerCycleResult =
  | { kind: 'processed'; status: number; counts: ProcessorCounts }
  | { kind: 'not-ready'; status: number }
  | { kind: 'rejected'; status: number }
  | { kind: 'invalid-response'; status: number }
  | { kind: 'unavailable' };

export type SchedulerFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface SchedulerCycleInput {
  appUrl: string;
  schedulerSecret: string;
  fetchImpl?: SchedulerFetch;
}

function processorCounts(value: unknown): ProcessorCounts | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<Record<keyof ProcessorCounts, unknown>>;
  const keys: Array<keyof ProcessorCounts> = ['claimed', 'sent', 'failed', 'recovered'];
  if (!keys.every((key) => Number.isInteger(candidate[key]) && Number(candidate[key]) >= 0)) return null;
  return {
    claimed: Number(candidate.claimed),
    sent: Number(candidate.sent),
    failed: Number(candidate.failed),
    recovered: Number(candidate.recovered),
  };
}

export async function runSchedulerCycle(input: SchedulerCycleInput): Promise<SchedulerCycleResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const baseUrl = input.appUrl.endsWith('/') ? input.appUrl : `${input.appUrl}/`;
  try {
    const health = await fetchImpl(new URL('api/health', baseUrl).toString(), { method: 'GET' });
    if (!health.ok) return { kind: 'not-ready', status: health.status };

    const response = await fetchImpl(
      new URL('api/internal/process-due-notifications', baseUrl).toString(),
      { method: 'POST', headers: { 'x-scheduler-secret': input.schedulerSecret } },
    );
    if (!response.ok) return { kind: 'rejected', status: response.status };
    const counts = processorCounts(await response.json().catch(() => null));
    return counts
      ? { kind: 'processed', status: response.status, counts }
      : { kind: 'invalid-response', status: response.status };
  } catch {
    return { kind: 'unavailable' };
  }
}
```

Implement `formatSchedulerCycleResult` with only fixed labels, status codes, and aggregate integers:

```ts
export function formatSchedulerCycleResult(result: SchedulerCycleResult): string {
  if (result.kind === 'processed') {
    const { claimed, sent, failed, recovered } = result.counts;
    return `processed status=${result.status} claimed=${claimed} sent=${sent} failed=${failed} recovered=${recovered}`;
  }
  if (result.kind === 'not-ready') return `application not ready status=${result.status}`;
  if (result.kind === 'rejected') return `processor rejected status=${result.status}`;
  if (result.kind === 'invalid-response') return `processor response invalid status=${result.status}`;
  return 'application unavailable';
}
```

- [ ] **Step 4: Run scheduler-client tests and observe GREEN**

Run:

```powershell
npx vitest run tests/unit/scheduler-client.test.ts --maxWorkers=1
```

Expected: all scheduler-client tests PASS without console warnings or leaked error text.

- [ ] **Step 5: Run existing processor boundary tests**

Run:

```powershell
npx vitest run tests/app/operations-routes.test.ts tests/integration/notification-processor.test.ts --maxWorkers=1
```

Expected: PASS; the route, processor, retries, leases, and idempotency are unchanged.

- [ ] **Step 6: Commit Task 3**

```powershell
git add src/server/notifications/scheduler-client.ts tests/unit/scheduler-client.test.ts
git commit -m "feat: add notification scheduler client"
```

---

### Task 4: Run the Worker with Local Development

**Files:**
- Create: `src/server/notifications/local-worker.ts`
- Create: `scripts/local-notification-worker.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md:14-81`
- Test: `tests/unit/local-notification-worker.test.ts`

**Interfaces:**
- Consumes: `runSchedulerCycle` and `formatSchedulerCycleResult` from Task 3.
- Produces: `LOCAL_NOTIFICATION_POLL_INTERVAL_MILLISECONDS = 30_000`.
- Produces: `localNotificationWorkerConfig(environment): LocalNotificationWorkerConfig`.
- Produces: `runLocalNotificationWorker(input): Promise<void>` with injected fetch, wait, and result callback boundaries.
- Consumes environment: `APP_URL` and `SCHEDULER_SECRET` loaded by `@next/env`.
- Produces npm scripts: `dev`, `dev:web`, and `dev:notifications`.
- Polling interval: exactly `30_000` milliseconds.

- [ ] **Step 1: Write failing worker configuration and polling tests**

Create `tests/unit/local-notification-worker.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  LOCAL_NOTIFICATION_POLL_INTERVAL_MILLISECONDS,
  localNotificationWorkerConfig,
  runLocalNotificationWorker,
} from '@/server/notifications/local-worker';

describe('localNotificationWorkerConfig', () => {
  it('accepts the local URL and a strong scheduler secret', () => {
    expect(localNotificationWorkerConfig({
      APP_URL: 'http://localhost:3000',
      SCHEDULER_SECRET: 'scheduler-secret-123456',
    })).toEqual({
      appUrl: 'http://localhost:3000',
      schedulerSecret: 'scheduler-secret-123456',
    });
  });

  it.each([
    [{ SCHEDULER_SECRET: 'scheduler-secret-123456' }, 'APP_URL must be configured'],
    [{ APP_URL: 'not a URL', SCHEDULER_SECRET: 'scheduler-secret-123456' }, 'APP_URL must be a valid URL'],
    [{ APP_URL: 'http://localhost:3000', SCHEDULER_SECRET: 'short' }, 'SCHEDULER_SECRET must contain at least 16 characters'],
  ])('rejects invalid worker configuration %#', (environment, message) => {
    expect(() => localNotificationWorkerConfig(environment)).toThrow(message);
  });
});

it('runs immediately and waits 30 seconds between cycles', async () => {
  const abortController = new AbortController();
  const fetchImpl = vi.fn()
    .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      claimed: 0,
      sent: 0,
      failed: 0,
      recovered: 0,
    }), { status: 200 }));
  const onResult = vi.fn();
  const wait = vi.fn(async (milliseconds: number) => {
    expect(milliseconds).toBe(LOCAL_NOTIFICATION_POLL_INTERVAL_MILLISECONDS);
    abortController.abort();
  });

  await runLocalNotificationWorker({
    appUrl: 'http://localhost:3000',
    schedulerSecret: 'scheduler-secret-123456',
    signal: abortController.signal,
    fetchImpl,
    wait,
    onResult,
  });

  expect(onResult).toHaveBeenCalledWith({
    kind: 'processed',
    status: 200,
    counts: { claimed: 0, sent: 0, failed: 0, recovered: 0 },
  });
  expect(wait).toHaveBeenCalledOnce();
});

it('continues polling after a rejected processor cycle', async () => {
  const abortController = new AbortController();
  const fetchImpl = vi.fn()
    .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    .mockResolvedValueOnce(new Response('{}', { status: 401 }))
    .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      claimed: 0,
      sent: 0,
      failed: 0,
      recovered: 0,
    }), { status: 200 }));
  const onResult = vi.fn();
  let waits = 0;
  const wait = vi.fn(async () => {
    waits += 1;
    if (waits === 2) abortController.abort();
  });

  await runLocalNotificationWorker({
    appUrl: 'http://localhost:3000',
    schedulerSecret: 'scheduler-secret-123456',
    signal: abortController.signal,
    fetchImpl,
    wait,
    onResult,
  });

  expect(onResult.mock.calls.map(([result]) => result.kind)).toEqual(['rejected', 'processed']);
});
```

- [ ] **Step 2: Run the worker tests and observe RED**

Run:

```powershell
npx vitest run tests/unit/local-notification-worker.test.ts --maxWorkers=1
```

Expected: FAIL because `src/server/notifications/local-worker.ts` does not exist.

- [ ] **Step 3: Implement validated configuration and the polling loop**

Create `src/server/notifications/local-worker.ts`:

```ts
import {
  runSchedulerCycle,
  type SchedulerCycleResult,
  type SchedulerFetch,
} from './scheduler-client';

export const LOCAL_NOTIFICATION_POLL_INTERVAL_MILLISECONDS = 30_000;

export interface LocalNotificationWorkerConfig {
  appUrl: string;
  schedulerSecret: string;
}

type WorkerEnvironment = Partial<Record<'APP_URL' | 'SCHEDULER_SECRET', string | undefined>>;

export function localNotificationWorkerConfig(
  environment: WorkerEnvironment,
): LocalNotificationWorkerConfig {
  const appUrl = environment.APP_URL?.trim();
  const schedulerSecret = environment.SCHEDULER_SECRET?.trim();
  if (!appUrl) throw new Error('APP_URL must be configured');
  try {
    new URL(appUrl);
  } catch {
    throw new Error('APP_URL must be a valid URL');
  }
  if (!schedulerSecret || schedulerSecret.length < 16) {
    throw new Error('SCHEDULER_SECRET must contain at least 16 characters');
  }
  return { appUrl, schedulerSecret };
}

export interface RunLocalNotificationWorkerInput extends LocalNotificationWorkerConfig {
  signal: AbortSignal;
  fetchImpl?: SchedulerFetch;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  onResult?: (result: SchedulerCycleResult) => void;
}

function defaultWait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

export async function runLocalNotificationWorker(
  input: RunLocalNotificationWorkerInput,
): Promise<void> {
  const wait = input.wait ?? defaultWait;
  while (!input.signal.aborted) {
    const result = await runSchedulerCycle(input);
    input.onResult?.(result);
    if (!input.signal.aborted) {
      await wait(LOCAL_NOTIFICATION_POLL_INTERVAL_MILLISECONDS, input.signal);
    }
  }
}
```

- [ ] **Step 4: Run worker and scheduler-client tests and observe GREEN**

Run:

```powershell
npx vitest run tests/unit/local-notification-worker.test.ts tests/unit/scheduler-client.test.ts --maxWorkers=1
```

Expected: both files PASS, one immediate cycle occurs, and the injected wait receives exactly `30_000`.

- [ ] **Step 5: Install exact worker dependencies**

Run:

```powershell
npm install @next/env@16.3.1
npm install --save-dev concurrently@10.0.5
```

Expected: `package.json` and `package-lock.json` add only these direct dependencies and their required transitive packages; the audit command exits successfully or reports existing advisories for separate review.

- [ ] **Step 6: Create the minimal local worker executable**

Create `scripts/local-notification-worker.ts`:

```ts
import { loadEnvConfig } from '@next/env';
import {
  formatSchedulerCycleResult,
} from '../src/server/notifications/scheduler-client';
import {
  localNotificationWorkerConfig,
  runLocalNotificationWorker,
} from '../src/server/notifications/local-worker';

const abortController = new AbortController();

loadEnvConfig(process.cwd());
const config = localNotificationWorkerConfig(process.env);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => abortController.abort());
}

await runLocalNotificationWorker({
  ...config,
  signal: abortController.signal,
  onResult: (result) => {
    console.info(`[notification-worker] ${new Date().toISOString()} ${formatSchedulerCycleResult(result)}`);
  },
});
```

The executable imports no application data repositories and never logs raw responses or caught errors.

- [ ] **Step 7: Make local development start both processes**

Update `package.json` scripts:

```json
{
  "scripts": {
    "dev": "concurrently --kill-others --names web,notifications --prefix-colors cyan,magenta \"npm:dev:web\" \"npm:dev:notifications\"",
    "dev:web": "next dev",
    "dev:notifications": "tsx scripts/local-notification-worker.ts"
  }
}
```

Keep all existing non-development scripts unchanged.

- [ ] **Step 8: Update local operations documentation**

Change README local startup to explain:

````markdown
5. Start Next.js and the 30-second local notification worker:

   ```powershell
   npm run dev
   ```

   `npm run dev` keeps both processes in one terminal. Keep that terminal running for email reminders. Use `npm run dev:web` only when intentionally developing without automatic email processing.
````

Add to the scheduled-trigger section:

```markdown
The local worker attempts due processing every 30 seconds, so Remindly normally submits local reminders within one minute. The GitHub Actions fallback still runs every ten minutes and does not provide the same timing guarantee.
```

- [ ] **Step 9: Verify package, worker, and script static correctness**

Run:

```powershell
npx vitest run tests/unit/scheduler-client.test.ts --maxWorkers=1
npx tsc --noEmit
npm run lint
```

Expected: all commands exit 0. No secret values appear in output.

- [ ] **Step 10: Commit Task 4**

```powershell
git add src/server/notifications/local-worker.ts src/server/notifications/scheduler-client.ts scripts/local-notification-worker.ts tests/unit/local-notification-worker.test.ts package.json package-lock.json README.md
git commit -m "feat: run notification worker with local development"
```

---

### Task 5: Full Regression and Live Delivery Verification

**Files:**
- Verify only; do not change user reminder data unless a failing test or confirmed configuration defect requires a separately reviewed fix.

**Interfaces:**
- Consumes the unified `npm run dev` command.
- Consumes the existing due `PENDING` notification as the authorized live delivery check.
- Produces test/build evidence and a sanitized final ledger status.

- [ ] **Step 1: Run the complete automated verification suite**

Run each command independently:

```powershell
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Expected: all commands exit 0. Record exact test counts and any warnings. Do not dismiss warnings that affect notification delivery.

- [ ] **Step 2: Inspect the final diff and commit boundaries**

Run:

```powershell
git status --short
git diff --check
git log -6 --oneline
```

Expected: no whitespace errors; unrelated pre-existing modifications remain unstaged and unchanged; each implementation commit contains only its task files.

- [ ] **Step 3: Stop only the existing Remindly development server**

Resolve the PID listening on port 3000, inspect its command line, and stop it only if the command belongs to `C:\Users\aliha\Downloads\Remindly` and is `next dev`. Do not stop unrelated Node.js processes.

Expected: port 3000 becomes available without affecting PostgreSQL.

- [ ] **Step 4: Start the unified development command**

Run in a persistent terminal:

```powershell
npm run dev
```

Expected within 60 seconds:

```text
[web] Ready
[notifications] [notification-worker] <timestamp> processed status=200 claimed=<n> sent=<n> failed=<n> recovered=<n>
```

The first cycle may claim the existing overdue notification. Do not manually call the endpoint in parallel.

- [ ] **Step 5: Verify health and sanitized notification state**

Run:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/health'
```

Then query PostgreSQL for only notification status metadata: reminder ID prefix, scheduled local time, status, attempt count, provider-message-ID presence, sent time, and sanitized last error. Do not output reminder names, email addresses, or provider IDs.

Expected for the previously overdue row:

```text
status                  SENT
attempt_count           1
provider_message_id     present
sent_at                 present
last_error              empty
```

If the row is `FAILED`, do not claim completion. Inspect the sanitized worker counts and Resend dashboard, form one evidence-based hypothesis, and follow the existing retry policy rather than resetting the ledger manually.

- [ ] **Step 6: Confirm the 30-second polling behavior**

Observe a second worker cycle without creating another reminder.

Expected:

```text
processed status=200 claimed=0 sent=0 failed=0 recovered=0
```

This proves the worker continues polling and that the already-sent row is not duplicated.

- [ ] **Step 7: Ask for inbox confirmation**

Ask the owner to check the Gmail inbox and Spam folder for the overdue reminder. State separately:

- Database/provider acceptance is verified by `SENT` plus a provider message ID.
- Human inbox receipt remains pending until the owner confirms it.

- [ ] **Step 8: Final implementation handoff**

Report:

- Custom exact date/time behavior and the on-or-before deadline rule.
- Local 30-second scheduler behavior and the requirement to keep `npm run dev` running.
- Full test, lint, typecheck, and build results.
- Live notification ledger result.
- Any remaining inbox-confirmation or production-hosting limitation.
