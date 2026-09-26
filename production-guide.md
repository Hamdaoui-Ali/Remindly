# Remindly Production Guide

This guide records how Remindly moved from a local Next.js project to a hosted production application connected to Supabase, deployed by Vercel, and reachable on the public internet.

It is written as an operational runbook: follow the sections in order for a new setup, then use the verification and troubleshooting sections for maintenance.

## 1. Deployment shape

Remindly is a Next.js application with Supabase Auth, Prisma-managed PostgreSQL data, Vercel hosting, and a scheduled notification processor.

```text
Browser
  -> Vercel production deployment
     -> Next.js server/runtime
        -> Supabase Auth for identity and sessions
        -> Supabase PostgreSQL for application data
        -> Resend or Gmail for notification email

GitHub Actions -> /api/internal/process-due-notifications -> Vercel runtime
```

The repository uses three environments:

- Local development: Docker PostgreSQL on port `5433` and a local Next.js server on port `3000`.
- Preview: Vercel deployments created from non-production branches or pull requests.
- Production: the `main` branch deployment in the Vercel project `hamdaoui-ali/remindly`, served at `https://remindlly.vercel.app/`.

## 2. Security rules for this guide

- Never commit `.env`, database URLs, Supabase secret keys, OAuth refresh tokens, API keys, or scheduler secrets.
- Put public Supabase values in the browser only when the variable name begins with `NEXT_PUBLIC_`.
- Keep `SUPABASE_SECRET_KEY`, `DATABASE_URL`, `DIRECT_URL`, mail credentials, and `SCHEDULER_SECRET` server-side.
- The values shown below are names, examples, or roles only. They are not production secrets.

## 3. Prerequisites

Install the following before working with the project:

- Node.js `^20.19`, `^22.12`, or `>=24.0.0`.
- npm.
- Docker Desktop with Docker Compose, or another PostgreSQL 16-compatible database for local work.
- A GitHub account with access to `Hamdaoui-Ali/Remindly`.
- A Supabase project for Auth and PostgreSQL.
- A Vercel account with access to the `hamdaoui-ali` team/project.

The required Node versions come from the Prisma 7 requirement recorded in `README.md`. Confirm the installed version before setup:

```powershell
node --version
npm --version
docker --version
```

The production provider accounts are separate responsibilities:

| Responsibility | Provider | Repository/config reference |
| --- | --- | --- |
| Source control and production branch | GitHub | `Hamdaoui-Ali/Remindly`, branch `main` |
| Application hosting and domains | Vercel | Project `hamdaoui-ali/remindly` |
| Authentication and hosted PostgreSQL | Supabase | `NEXT_PUBLIC_SUPABASE_URL` and database URLs |
| Email delivery | Resend or Gmail | `EMAIL_PROVIDER` and provider credentials |
| Scheduled processing fallback | GitHub Actions | `.github/workflows/process-due-notifications.yml` |

## 4. Repository map

The important deployment files are already versioned in the repository:

| Path | Purpose |
| --- | --- |
| `package.json` | Scripts, Next.js/React dependencies, Prisma commands, tests, and the production build command. |
| `src/app/` | Next.js routes and pages, including Auth callbacks and internal processor endpoints. |
| `src/lib/supabase/` | Browser, server, proxy, and admin Supabase clients. |
| `src/server/db/client.ts` | Runtime Prisma client using `DATABASE_URL`. |
| `src/server/profile/` | User profile repository and Auth/profile reconciliation logic. |
| `prisma/schema.prisma` | Application data model and table mappings. |
| `prisma/migrations/` | Versioned PostgreSQL schema migrations. |
| `prisma.config.ts` | Prisma CLI configuration; migrations use `DIRECT_URL`. |
| `infra/supabase/001-profile-sync.sql` | Hosted-only Auth profile foreign key and synchronization triggers. |
| `scripts/reconcile-supabase-profiles.ts` | Dry-run/apply profile repair command. |
| `.github/workflows/process-due-notifications.yml` | Manual GitHub Actions call to the protected notification processor. |
| `.env.example` | Variable names and safe local placeholders. |
| `next.config.ts` | Next.js configuration; currently intentionally minimal. |

Do not edit generated files under `src/generated/prisma/` by hand. Regenerate them with the repository script after schema changes.

## 5. Bootstrap the project locally

From a clean clone:

```powershell
git clone https://github.com/Hamdaoui-Ali/Remindly.git
Set-Location .\Remindly
npm install
Copy-Item .env.example .env
```

Review every placeholder in `.env` before starting the application. Local development uses the PostgreSQL service declared in `docker-compose.yml`:

```powershell
docker compose up -d postgres
docker compose ps
```

The compose file maps host port `5433` to PostgreSQL’s container port `5432`, uses database/user/password `remindly`, and stores data in the named Docker volume `remindly-postgres-data`.

Generate the Prisma client, apply the versioned schema, and seed the legacy singleton settings row:

```powershell
npx prisma validate
npm run db:generate
npx prisma migrate deploy
npx prisma db seed
```

Start the web server and local notification worker together:

```powershell
npm run dev
```

Open `http://localhost:3000/login`. Supabase Auth owns registration, sessions, password recovery, email verification, and Auth callbacks. Use `npm run dev:web` only when the local notification worker should be omitted.

## 6. Local environment file

`.env.example` is the source of truth for variable names. Copy it to `.env` for local work, then replace placeholders. The file is ignored by Git and must stay local.

The database and Supabase variables are:

| Variable | Local role | Secret? | Production source |
| --- | --- | --- | --- |
| `DATABASE_URL` | Runtime PostgreSQL connection. Local example points to `localhost:5433`. | Yes | Supabase pooled/runtime connection, stored in Vercel Production variables. |
| `DIRECT_URL` | Prisma CLI migration connection. Local example points directly to local PostgreSQL. | Yes | Supabase direct or session-pooler connection, stored in Vercel Production variables. |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL used by browser/server clients. | No | Supabase project dashboard, then Vercel Production/Preview as needed. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe Supabase publishable key. | No | Supabase project API settings, then Vercel. |
| `SUPABASE_SECRET_KEY` | Server-only Supabase Admin API key used by reconciliation/admin operations. | Yes | Supabase project API settings, then Vercel Production only. |
| `SUPABASE_SEND_EMAIL_HOOK_SECRET` | Shared secret for the Supabase Send Email Hook endpoint. | Yes | Generate/store in Vercel and configure the matching Supabase hook. |
| `OWNER_EMAIL` | Legacy local seed compatibility value. | Sensitive | Keep local unless an explicitly supported seed flow requires it. |

For Supabase connection strings, use the pooler for normal application traffic and a direct/session connection for Prisma migrations. Transaction pooler port `6543` is for runtime traffic; use a direct connection or session pooler port `5432` for migrations when the Supabase network configuration requires it.

The scheduler, application URL, and email variables are:

| Variable | Purpose | Secret? |
| --- | --- | --- |
| `SCHEDULER_SECRET` | Authorizes `POST /api/internal/process-due-notifications`. | Yes |
| `APP_URL` | Canonical origin used by jobs and links, for example `https://remindlly.vercel.app`. | No, but must be correct |
| `EMAIL_PROVIDER` | Selects `resend` or `gmail`. | No |
| `RESEND_API_KEY` | API credential for the Resend notification path. | Yes |
| `RESEND_FROM` | Verified sender identity for Resend, such as `Remindly <reminders@example.com>`. | No, but provider-validated |
| `GMAIL_CLIENT_ID` | Google OAuth client identifier when Gmail delivery is enabled. | No |
| `GMAIL_CLIENT_SECRET` | Google OAuth client secret. | Yes |
| `GMAIL_REFRESH_TOKEN` | Offline Gmail OAuth refresh token. | Yes |
| `GMAIL_SENDER_EMAIL` | Gmail sender address. | No |
| `GMAIL_SENDER_NAME` | Display name for Gmail messages. | No |
| `GMAIL_TOTAL_DAILY_BUDGET` | Total Gmail delivery budget; the example is `350`. | No |
| `GMAIL_AUTH_RESERVE` | Reserved Gmail capacity for Auth mail; the example is `50`. | No |
| `GMAIL_REQUEST_TIMEOUT_MS` | Gmail request timeout; the example is `10000`. | No |
| `GMAIL_AUTH_HOOK_TOTAL_TIMEOUT_MS` | Total Auth hook timeout; the example is `4000`. | No |
| `TEST_DATABASE_URL` | Dedicated test database URL ending in `_test`. | Yes |

`EMAIL_PROVIDER=gmail` requires the four Gmail credential/address variables. Keep Gmail budget values below provider limits and preserve the Auth reserve. The test database variable is for Vitest/CI, not the Vercel runtime.

Older local `.env` files may still contain `AUTH_SECRET`, `NEXTAUTH_URL`, or `OWNER_PASSWORD_HASH` from an earlier auth implementation. The current production path is Supabase Auth; do not copy legacy values into Vercel unless a current code path explicitly requires them.

## 7. Prisma and PostgreSQL configuration

The runtime and CLI intentionally use different connection variables:

- `src/server/db/client.ts` creates the Prisma client from `DATABASE_URL`.
- `prisma.config.ts` points Prisma CLI migrations at `DIRECT_URL`.
- `prisma/schema.prisma` maps application models to the `public` schema.
- `prisma/migrations/` is the authoritative ordered schema history.

This split matters for Supabase because pooled runtime connections and migration-capable direct/session connections have different connection behavior. Never replace `DIRECT_URL` with an arbitrary URL just because it reaches the same project; confirm that the connection supports DDL and prepared statements.

Useful local commands:

```powershell
npx prisma validate
npm run db:generate
npx prisma migrate status
npx prisma migrate deploy
npx prisma db seed
```

Use `migrate deploy` for an existing environment. Use `migrate dev` only when intentionally creating or iterating on a development migration. Export or snapshot production data before applying a strict cutover SQL file such as `prisma/cutover/20260831100000_enforce_alert_cutover.sql`.

The normal application build is defined in `package.json` as `next build`. It does not implicitly apply database migrations, so schema rollout is a separate, deliberate deployment step.

## 8. Create and configure the Supabase project

1. Create a Supabase project for Remindly. Record the project URL, publishable key, and server-only secret key in a secure password manager or secret store.
2. In Supabase Project Settings, open the database connection information and copy two connection strings:
   - A pooled/runtime connection for `DATABASE_URL`.
   - A direct or session-pooler connection for `DIRECT_URL`.
3. Confirm both URLs target the same project and the `public` schema. Do not paste either URL into chat, tickets, source files, or screenshots.
4. In Supabase Authentication, configure the site URL and redirect URLs for the local origin and the Vercel production origin.
5. Configure the Auth email provider and any required Send Email Hook. The hook endpoint is the deployed Remindly route documented in the application code; its shared secret is `SUPABASE_SEND_EMAIL_HOOK_SECRET`.
6. Create or invite the first Auth user. Supabase Auth owns the identity; Remindly stores application preferences in `public.user_profiles` keyed by the Auth user UUID.

The public values can be used by browser and server clients. The secret key must only be available to server-side administrative operations. Vercel environment variables should be added separately for Production and Preview rather than copied into a committed file.

Before connecting Vercel, verify the Supabase project independently by creating a test Auth user and confirming that the Auth dashboard shows the account. Delete test accounts only when that cleanup is explicitly intended.
