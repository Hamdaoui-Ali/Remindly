# Remindly

Remindly is a Supabase-authenticated deadline reminder application. It turns each reminder cycle into durable notification records, scopes data to the authenticated user's profile, shows urgency in that user's timezone, and sends due email through a bounded, retry-safe processor.

## Requirements

- Node.js `^20.19`, `^22.12`, or `>=24.0.0` (the Prisma 7 requirement; Next.js alone supports `>=20.9.0`)
- npm
- Docker with Docker Compose, or another PostgreSQL instance
- A PostgreSQL database for local development; Gmail delivery remains a later refactor slice

## Local setup

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Copy `.env.example` to `.env` and replace every placeholder. `DATABASE_URL` is the runtime connection; `DIRECT_URL` is the direct/session connection used by Prisma CLI migrations. Prisma CLI loads `.env` through `prisma.config.ts`, and Next.js also loads it for local development. Generate secrets locally:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   `SCHEDULER_SECRET` protects the internal processor endpoint. `RESEND_FROM` is retained only for the legacy notification path and must be a sender identity verified in the configured provider.

3. Start PostgreSQL and wait for it to become healthy:

   ```powershell
   docker compose up -d postgres
   docker compose ps
   ```

   Compose stores data in the named `remindly-postgres-data` volume and checks readiness with `pg_isready`.

4. Generate the Prisma client, apply migrations, and seed the legacy compatibility settings:

   ```powershell
   npx prisma validate
   npm run db:generate
   npx prisma migrate deploy
   npx prisma db seed
   ```

   The current `refacto` migrations are additive. They add the Supabase-compatible profile, alert, schedule-version, and operational-ledger tables. Authenticated user-facing routes now use Supabase Auth and profile ownership; the hosted profile trigger and ownership backfill are intentionally separate follow-up migrations.

5. Start Next.js and the 30-second local notification worker:

   ```powershell
   npm run dev
   ```

   `npm run dev` keeps both processes in one terminal. Keep that terminal running for email reminders. Use `npm run dev:web` only when intentionally developing without automatic email processing.

   Open `http://localhost:3000/login` and sign in with a Supabase Auth account. Registration and recovery pages are implemented in the next Auth-flow slice.

## Verification

Run the non-browser checks:

```powershell
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Vitest never runs against the application database. Before any test module imports, it resolves `DATABASE_URL` to a dedicated PostgreSQL database whose name ends in `_test` (for the default local setup, `remindly_test`). The global test setup creates that database if needed and applies the existing Prisma migrations.

By default, Vitest derives the test URL from `DATABASE_URL` only when its host is `localhost` or `127.0.0.1`. For a remote or separately managed test database, set `TEST_DATABASE_URL` to a PostgreSQL URL whose database name ends in `_test`:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://user:password@db.example.test:5432/remindly_ci_test'
npm test
```

Vitest rejects non-PostgreSQL URLs, non-local implicit derivation, unsafe or ambiguous database names, and any final database name that does not end in `_test`. This applies to both `npm test` and direct `npx vitest` commands.

When running Prisma commands after upgrading an older local `.env`, add `DIRECT_URL` with the same local PostgreSQL URL used by `DATABASE_URL`. For Supabase, `DATABASE_URL` should be the pooled runtime URL and `DIRECT_URL` should be the direct/session URL used by Prisma migrations.

The end-to-end suite starts its own Next.js development server and reads its database from `E2E_DATABASE_URL`, falling back to `DATABASE_URL`:

```powershell
npx playwright install --with-deps chromium
npm run test:e2e
```

The default Vitest script runs serially to avoid contention between integration files that share the singleton settings row.

## Operations contract

### Legacy reminder alert backfill

The multi-alert cutover keeps the legacy reminder columns readable while old
rows are converted. The backfill is read-only by default and prints aggregate
counts only:

```powershell
npm run reminders:backfill -- --dry-run
```

Review the report before applying changes. Export the database first, then run:

```powershell
npm run reminders:backfill -- --apply
```

The command is idempotent: rerunning it does not create a second alert for a
reminder that already has an enabled alert. Cutover is not ready while the
report contains missing owners, missing current notifications, mismatched
schedule versions/timestamps, invalid legacy schedules, or unreconciled
reminder counts. Roll back by deploying the previous application version; do
not apply the strict-schema migration until the report is ready.

### Supabase profile synchronization

Apply `infra/supabase/001-profile-sync.sql` only in the hosted Supabase SQL
editor or a Supabase migration. It creates the Auth profile triggers and the
foreign-key cascade from `auth.users` to application-owned profile data. Do
not apply it to the local Docker database because `auth.users` is managed by
Supabase.

Profile reconciliation is read-only by default:

```powershell
npm run profiles:reconcile
```

Review the sanitized counts and orphan profile UUIDs, then explicitly apply
missing/stale profile repairs with:

```powershell
npm run profiles:reconcile -- --apply
```

The command never logs profile email addresses. It preserves existing
timezone and default-alert preferences when repairing email or verification
metadata. Keep the default dry-run for scheduled audits.

### Health

`GET /api/health` is public so infrastructure can check readiness. A healthy database returns HTTP 200:

```json
{ "status": "ok", "database": "ok" }
```

A database failure returns HTTP 503 with `status: "degraded"`. The response never includes reminder data, credentials, provider keys, or database error details.

### Notification processor

`POST /api/internal/process-due-notifications` accepts only the server-side `x-scheduler-secret` header. Browser sessions do not authorize this endpoint. A valid request processes at most 50 notifications and returns only counts:

```json
{ "claimed": 0, "sent": 0, "failed": 0, "recovered": 0 }
```

The processor claims ledger rows atomically, isolates each send, uses a 15-minute processing lease, and stops automatic delivery after five attempts. Every retry reuses the notification UUID as the provider idempotency key. `SENT` means the email provider accepted the request; it is not a claim of mailbox delivery. Late scheduler runs catch up because eligibility is based on stored due and retry timestamps.

Do not log request headers, environment values, reminder names, email bodies, or provider errors. The endpoint logs a random run identifier and aggregate counts only.

### Scheduled trigger

The workflow in `.github/workflows/process-due-notifications.yml` calls the processor every ten minutes and can also be run manually. Add these encrypted GitHub repository secrets:

- `APP_URL`: the canonical deployed origin, such as `https://remindly.example.com`
- `SCHEDULER_SECRET`: the same random value deployed as the application's `SCHEDULER_SECRET`

The workflow captures the response status and explicitly accepts only HTTP 200–299. Redirects, authentication failures, and all other responses fail visibly in Actions. GitHub scheduled workflows are best effort; the processor's due-time query recovers work after delayed or missed triggers.

The local worker attempts due processing every 30 seconds, so Remindly normally submits local reminders within one minute. The GitHub Actions fallback still runs every ten minutes and does not provide the same timing guarantee.

## Production environment

Deploy the Next.js application as one service with managed PostgreSQL. Required server-only values are documented in `.env.example`. Keep `SUPABASE_SECRET_KEY`, `SCHEDULER_SECRET`, `RESEND_API_KEY`, `DATABASE_URL`, and `DIRECT_URL` in the deployment platform's encrypted secret store. For Supabase, use the pooled connection for `DATABASE_URL` and the direct/session connection for `DIRECT_URL`. Set `APP_URL` to the canonical HTTPS origin.
