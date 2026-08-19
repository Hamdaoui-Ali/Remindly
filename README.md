# Remindly

Remindly is a private, single-owner deadline reminder application. It turns each reminder cycle into one durable notification record, shows urgency in the owner's timezone, and sends due email through a bounded, retry-safe processor.

## Requirements

- Node.js `^20.19`, `^22.12`, or `>=24.0.0` (the Prisma 7 requirement; Next.js alone supports `>=20.9.0`)
- npm
- Docker with Docker Compose, or another PostgreSQL instance
- A Resend API key and verified sender identity for real email delivery

## Local setup

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Copy `.env.example` to `.env` and replace every placeholder. Prisma CLI loads `.env` through `prisma.config.ts`, and Next.js also loads it for local development. Generate secrets locally:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   node -e "console.log(require('bcryptjs').hashSync('replace-with-a-strong-password', 12))"
   ```

   Use separate random values for `AUTH_SECRET` and `SCHEDULER_SECRET`. Store only the bcrypt output in `OWNER_PASSWORD_HASH`; never commit the plaintext owner password. `RESEND_FROM` must be a sender identity verified in the Resend account.

3. Start PostgreSQL and wait for it to become healthy:

   ```powershell
   docker compose up -d postgres
   docker compose ps
   ```

   Compose stores data in the named `remindly-postgres-data` volume and checks readiness with `pg_isready`.

4. Generate the Prisma client, apply migrations, and seed the singleton owner settings:

   ```powershell
   npx prisma validate
   npm run db:generate
   npx prisma migrate deploy
   npx prisma db seed
   ```

5. Start the application:

   ```powershell
   npm run dev
   ```

   Open `http://localhost:3000/login` and sign in with `OWNER_EMAIL` and the plaintext password that produced `OWNER_PASSWORD_HASH`.

## Verification

Run the non-browser checks:

```powershell
npm test -- --maxWorkers=1
npm run lint
npx tsc --noEmit
npm run build
```

The integration tests require a migrated PostgreSQL database at `DATABASE_URL`. The end-to-end suite starts its own Next.js development server and reads its database from `E2E_DATABASE_URL`, falling back to `DATABASE_URL`:

```powershell
npx playwright install --with-deps chromium
npm run test:e2e
```

Serial Vitest execution avoids contention between integration files that share the singleton settings row.

## Operations contract

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

## Production environment

Deploy the Next.js application as one service with managed PostgreSQL. Required server-only values are documented in `.env.example`. Keep `AUTH_SECRET`, `OWNER_PASSWORD_HASH`, `SCHEDULER_SECRET`, `RESEND_API_KEY`, and the database URL in the deployment platform's encrypted secret store. Set both `APP_URL` and `NEXTAUTH_URL` to the canonical HTTPS origin.
