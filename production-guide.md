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
