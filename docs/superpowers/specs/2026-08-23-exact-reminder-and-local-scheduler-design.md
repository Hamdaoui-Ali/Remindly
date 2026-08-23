# Exact Reminder Scheduling and Local Delivery Worker

Date: 2026-08-23
Status: Approved in chat

## Goal

Remindly must let its owner choose either a common relative reminder or an exact custom reminder date and time. A custom reminder must be on or before the task end date. While the application is running locally, due email notifications should normally be submitted to Resend within one minute.

## Current Problem

The application stores durable notification rows and has a retry-safe processor, but `npm run dev` starts only Next.js. Nothing calls the processor locally, so due rows remain `PENDING` with zero attempts. The existing GitHub Actions trigger runs independently of local development and polls only every ten minutes.

The reminder form also restricts `leadDays` to six presets. The database already stores both the relative day count and the normalized exact `alertAt` instant, so an exact date can be supported without changing the database schema.

## Decisions

### Schedule representation

Keep these existing database fields:

- `endDate`: the task deadline date.
- `alertLeadDays`: the number of calendar days between the reminder date and the end date.
- `alertTime`: the owner's local reminder time in `HH:MM` form.
- `alertAt`: the exact UTC instant calculated using the configured owner timezone.

Widen application validation for `leadDays` from a fixed preset union to a non-negative bounded integer. The upper bound will be 36,500 days to prevent invalid or unreasonably large date arithmetic while allowing long-lived reminders.

No Prisma schema change or database migration is required.

### Form behavior

Keep the existing relative choices:

- Same day
- 1 day before
- 3 days before
- 7 days before
- 14 days before
- 30 days before

Add `Custom date and time` to the `Remind me` selector.

When Custom is selected:

- Show a `Reminder date` date input.
- Keep the existing `At` time input.
- Require a valid reminder date.
- Require the reminder date to be on or before the end date.
- Convert the calendar-day difference into `leadDays` before submitting.

The server remains authoritative. It accepts any integer `leadDays` from 0 through 36,500, recalculates `alertAt` using the singleton settings timezone, and rejects values outside that range.

When editing or renewing a reminder:

- A stored lead day value matching a preset reopens as that preset.
- Any other stored value reopens as Custom.
- The custom date is reconstructed from `endDate - alertLeadDays`.
- If a custom date happens to equal a preset interval, reopening it as that preset is acceptable because the exact schedule is unchanged.

Changing the end date does not silently change a selected custom reminder date. If the custom date becomes later than the new end date, the form displays an error and blocks submission.

### Local delivery worker

Add a standalone TypeScript worker that:

1. Loads `APP_URL` and `SCHEDULER_SECRET` from the local environment.
2. Calls `GET /api/health` until the Next.js server is ready.
3. Calls `POST /api/internal/process-due-notifications` immediately after readiness.
4. Repeats the processor call every 30 seconds.
5. Sends the scheduler secret only through the `x-scheduler-secret` header.
6. Logs only timestamps, HTTP status, and aggregate processor counts.
7. Never logs secrets, recipient addresses, reminder names, provider errors, or message bodies.
8. Handles temporary connection failures by logging a short warning and trying again on the next interval.
9. Stops cleanly on `SIGINT` or `SIGTERM`.

Use a small process runner so `npm run dev` starts both Next.js and the local worker. Preserve a separate `dev:web` command for cases where only the web server is wanted. The worker remains an explicit process rather than a Next.js instrumentation timer, avoiding duplicate timers during hot reload.

The GitHub Actions workflow remains a deployment fallback. Its ten-minute cadence does not satisfy one-minute delivery and is not presented as doing so. A deployed one-minute guarantee would require a continuously running worker or a hosting scheduler with one-minute support.

## Data Flow

### Creating or editing a relative reminder

1. The owner chooses an end date, preset lead interval, and time.
2. The client submits `endDate`, integer `leadDays`, and `alertTime`.
3. Server validation accepts the bounded integer.
4. The service calculates `alertAt` in `Africa/Casablanca` or the currently configured timezone.
5. The reminder and matching `PENDING` notification row are committed atomically.
6. The local worker calls the processor within 30 seconds.
7. Once due, the processor claims the row and submits it to Resend with the notification UUID as its idempotency key.

### Creating or editing a custom reminder

1. The owner chooses an end date, exact reminder date, and exact reminder time.
2. The client validates `reminderDate <= endDate` using calendar dates.
3. The client calculates `leadDays = endDate - reminderDate` and submits the existing API shape.
4. The server validates the integer and independently calculates the exact timezone-aware `alertAt`.
5. The existing notification lifecycle and worker flow continue unchanged.

### Editing an existing schedule

The existing transaction cancels the old pending notification and creates a new pending row for the new `alertAt`. Sent history remains unchanged. The processor's existing schedule equality check prevents stale rows from being delivered.

## Email Configuration

Local testing continues to use `Remindly <onboarding@resend.dev>`. The configured recipient is the same address used for the Resend account, which is required by Resend's testing sender. The configured API key has sending access.

After implementation, the existing overdue pending notification will be processed once as an end-to-end verification. Success requires:

- Processor result reports `sent: 1` for that row.
- The notification becomes `SENT`.
- A provider message ID is stored.
- The user confirms inbox receipt, including checking Spam if necessary.

If Resend rejects the request, the existing retry policy marks it `FAILED` without exposing provider details to clients. Diagnosis will use aggregate processor output, the sanitized ledger status, and the Resend dashboard.

## Validation and Error Handling

- Missing custom date: block submission with `Choose a reminder date.`
- Custom date after end date: block submission with `Reminder date must be on or before the end date.`
- Invalid time: retain the existing `HH:MM` validation.
- Invalid or out-of-range `leadDays`: return the existing structured HTTP 400 validation response.
- A reminder already due remains allowed and displays the existing warning; the worker makes it eligible for immediate processing.
- Worker authentication failure: log a sanitized HTTP status and continue polling, so configuration can be corrected without restarting both processes.
- Web server unavailable: retry after 30 seconds without terminating Next.js.
- Processor/provider failure: retain the existing durable retry and idempotency behavior.

## Testing Strategy

Implementation follows test-driven development.

### Unit tests

- Accept non-preset non-negative `leadDays`, such as 2.
- Reject negative, fractional, and over-limit `leadDays`.
- Convert an exact custom date to the correct calendar-day difference.
- Reconstruct a custom date from an end date and stored lead days.
- Handle month, year, leap-day, and Casablanca offset boundaries.
- Exercise one worker polling cycle with successful, unauthorized, unavailable, and malformed responses without exposing secrets.

### Component tests

- Selecting Custom reveals the reminder date input.
- A custom date after the end date blocks submission.
- A valid custom date submits the computed `leadDays` and selected time.
- A non-preset stored value reopens in Custom mode with the correct date.
- Preset behavior remains unchanged.

### Integration tests

- A reminder with a non-preset lead interval creates a matching notification at the exact `alertAt` instant.
- Editing that custom schedule cancels the previous pending row and creates the replacement.
- Existing notification processor concurrency, retry, and idempotency tests remain green.

### Final verification

- Run the focused tests through red and green phases.
- Run the full Vitest suite.
- Run ESLint, TypeScript checking, and the production build.
- Restart development with the unified command.
- Confirm the worker reaches the health endpoint and invokes the processor.
- Process the existing overdue row and inspect its final sanitized ledger state.
- Ask the user to confirm receipt in the configured Gmail inbox.

## Out of Scope

- Multiple reminders for one task cycle.
- SMS, push, or other notification channels.
- Changing the Resend provider.
- Buying or verifying a custom sending domain.
- Claiming exact inbox arrival time; the one-minute target covers submission attempts by Remindly.
- A one-minute production scheduler for serverless or sleeping free-tier hosts.
