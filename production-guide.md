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

## 9. Supabase Auth and application profiles

Supabase Auth owns users, sessions, passwords, email verification, and the `auth.users` lifecycle. Remindly owns the matching application profile in `public.user_profiles`, including timezone and default alert time.

Apply `infra/supabase/001-profile-sync.sql` only to the hosted Supabase database. It:

- Adds the `user_profiles.id -> auth.users.id` foreign key with delete cascade.
- Creates `on_auth_user_created` to insert a default `UTC`/`09:00` profile.
- Creates `on_auth_user_updated` to synchronize email and verification metadata.
- Replaces the triggers idempotently when the SQL is rerun.

The file must not be applied to the local Docker database because local PostgreSQL does not contain Supabase’s managed `auth.users` table.

For existing Auth users, run the reconciliation command from a trusted environment with `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, and `DATABASE_URL` configured:

```powershell
npm run profiles:reconcile
npm run profiles:reconcile -- --apply
```

The first command is a dry run. Review the sanitized counts and orphaned UUID list. The second command creates missing profiles and updates email/verification metadata while preserving existing timezone and alert-time preferences.

If an emergency repair is performed from the hosted SQL editor instead, backfill only from `auth.users` into `public.user_profiles`, include explicit `created_at` and `updated_at` timestamps, and verify the count of Auth users with email, profile rows, and missing rows afterward. Never print email addresses or secret values in operational logs.

## 10. Apply the production database schema

Run schema deployment from a trusted machine or a dedicated migration job, never from a developer’s default local database by accident.

1. Confirm `DIRECT_URL` targets the intended production Supabase project and uses a direct/session-capable connection.
2. Export or snapshot production data according to the project’s backup policy.
3. Check the pending migration list:

   ```powershell
   npx prisma migrate status
   ```

4. Apply only the committed migrations:

   ```powershell
   npx prisma migrate deploy
   ```

5. Run `npx prisma migrate status` again and require `Database schema is up to date!`.
6. Apply the hosted profile-sync SQL and reconcile existing Auth users as described above.

The production repair for this project applied these seven migrations in order:

1. `20260819013000_init`
2. `20260819020000_enforce_settings_singleton`
3. `20260830213000_refactor_foundation`
4. `20260831090000_add_reminder_due_at`
5. `20260831220000_add_email_attempt_notification_id`
6. `20260831223000_add_gmail_circuit_state`
7. `20260901190000_allow_multiple_email_attempts`

Do not use `prisma migrate dev` against production. Do not apply `prisma/cutover/` SQL until its dry-run/backfill prerequisites are satisfied and a backup exists.

## 11. Connect GitHub to Vercel

The production deployment was connected to the GitHub repository rather than uploaded manually:

1. Sign in to Vercel and select the `hamdaoui-ali` team.
2. Choose **Add New... → Project**.
3. Import `Hamdaoui-Ali/Remindly` from GitHub.
4. Keep the repository root as the project root; this is not a monorepo deployment.
5. Let Vercel detect the Next.js framework.
6. Set the production branch to `main`.
7. Add the environment variables before the first production deployment.
8. Deploy, then open the deployment’s **Visit** link.

The project is visible at `https://vercel.com/hamdaoui-ali/remindly`. The dashboard’s **Overview** page shows the production deployment, its Git commit, its domain, and its current Ready/Error status. The **Deployments** page lists preview and production deployments; the **Logs** page exposes runtime request logs.

For normal Git-connected operation, pushing to `main` creates or updates the production deployment. Pull requests and non-production branches create Preview deployments when enabled by the project settings.

Do not use a Vercel deployment URL as the canonical application URL. Keep `APP_URL` aligned with the production domain configured under the project’s Domains settings.

## 12. Add variables in Vercel

In the Vercel project:

1. Open **Settings**.
2. Open **Environment Variables**.
3. Select **Project** variables.
4. Click **Add Environment Variable**.
5. Enter the exact variable name from `.env.example`.
6. Paste the value from the appropriate provider’s secure settings page.
7. Select the target environment: **Production**, **Preview**, **Development**, or a deliberate combination.
8. Save the variable, then redeploy any deployment that must receive the new value.

Use this target matrix as the baseline:

| Vercel variable group | Production | Preview | Source |
| --- | --- | --- | --- |
| `DATABASE_URL`, `DIRECT_URL` | Required | Required if Preview uses a database | Supabase connection settings |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Required | Required | Supabase project API settings |
| `SUPABASE_SECRET_KEY`, `SUPABASE_SEND_EMAIL_HOOK_SECRET` | Required | Only if Preview exercises admin/Auth-hook paths | Supabase/API or generated secret |
| `APP_URL` | `https://remindlly.vercel.app` | Preview URL or a test origin | Vercel domain/deployment URL |
| `SCHEDULER_SECRET` | Required | Usually not needed | Generated random secret; also GitHub secret |
| `EMAIL_PROVIDER` and provider credentials | Required for mail | Use a safe test provider or controlled Preview values | Resend/Gmail settings |

Vercel shows secret values as encrypted/hidden after saving. Use the variable name, environment target, and **Last Updated** metadata for audits; do not reveal values just to verify that a variable exists. If a variable is changed, create a new deployment or redeploy the affected deployment because existing serverless instances keep the environment they were built with.

Do not put `TEST_DATABASE_URL` in Production. Keep test databases isolated and named with a `_test` suffix.

## 13. Vercel build and runtime settings

In **Settings → Build and Deployment**, verify the project settings match the repository:

- Framework preset: Next.js.
- Root directory: repository root.
- Install command: the package manager’s normal install command, normally `npm install`/Vercel’s detected install step.
- Build command: `npm run build`, which resolves to `next build` in `package.json`.
- Production branch: `main`.
- Node.js version: use a version supported by both the repository’s Prisma requirement and the selected Vercel runtime.

The successful Vercel build proves that the Next.js bundle compiled. It does not prove that the connected PostgreSQL schema is current or that Auth profile rows exist. Treat these as separate gates:

1. Build gate: Vercel deployment reaches **Ready**.
2. Schema gate: `npx prisma migrate status` reports no pending migrations.
3. Auth/profile gate: Supabase Auth users have matching `public.user_profiles` rows.
4. Runtime gate: the public route and authenticated dashboard return successfully.

Because the current `build` script is only `next build`, do not assume a Vercel redeploy applies Prisma migrations. Run migrations through the controlled production procedure in Section 10 before or alongside the deployment, then verify the resulting runtime logs.

When changing build settings, use a Preview deployment first. Confirm the exact commit, environment target, build output, and runtime behavior before promoting or pushing to `main`.

## 14. Configure and verify the public domain

The production project uses the Vercel domain `remindlly.vercel.app` (the spelling has two `l` characters before `.vercel.app`). It is attached to the production deployment in the Vercel project.

Find it in Vercel at **Project → Settings → Domains**. The domain page is where you verify:

- The domain is assigned to the intended project.
- The production branch/deployment is the target.
- HTTPS is active.
- There are no conflicting redirects or duplicate domain assignments.

After a domain change, update `APP_URL` in Vercel and the matching GitHub Actions secret. Also update Supabase Authentication’s site URL and redirect allow-list. Test the exact canonical URL from a fresh browser session, not only the Vercel deployment URL.

A domain can be attached and the deployment can be marked **Ready** while the application still returns a server error. Domain status validates routing; it does not validate database migrations, Auth profile synchronization, or runtime code paths.

## 15. Configure the notification processor fallback

The repository includes `.github/workflows/process-due-notifications.yml`. The current workflow is manually dispatchable through GitHub Actions and calls:

```text
POST ${APP_URL}/api/internal/process-due-notifications
Header: x-scheduler-secret: <SCHEDULER_SECRET>
```

It requires an HTTP 2xx response and fails the workflow for redirects, authentication errors, or server errors.

Configure the GitHub repository secrets at **GitHub → Hamdaoui-Ali/Remindly → Settings → Secrets and variables → Actions**:

| GitHub Actions secret | Value source |
| --- | --- |
| `APP_URL` | Same canonical production origin stored in Vercel, currently `https://remindlly.vercel.app`. |
| `SCHEDULER_SECRET` | The same random value stored as the Vercel Production `SCHEDULER_SECRET`. |

The local worker runs every 30 seconds through `npm run dev`; GitHub Actions is a fallback for hosted processing. The checked-in workflow currently declares `workflow_dispatch`, so a recurring cron schedule must be added and reviewed separately if automatic GitHub scheduling is desired.

Keep the processor endpoint internal. Do not remove its shared-secret check, and do not place the secret in a URL query string where it could be logged.

## 16. Production deployment and verification

Use this order for a release:

1. Review the working tree and confirm the intended commit is on the release branch.
2. Run local validation where the required test database is available:

   ```powershell
   npm test
   npm run lint
   npx tsc --noEmit
   npm run build
   ```

3. Apply pending production Prisma migrations through the controlled procedure in Section 10.
4. Apply hosted Supabase profile synchronization SQL if the Auth/profile integration is new or has not been installed.
5. Reconcile existing Auth users and require zero missing profiles.
6. Push the intended commit to the configured GitHub branch.
7. In Vercel **Deployments**, open the new deployment and confirm:
   - The source repository, branch, and commit are correct.
   - Build status is **Ready**.
   - The production domain points at the intended deployment.
8. Open the canonical URL in a fresh browser session.
9. Verify the login/register/recovery paths, authenticated dashboard, Reminders page, and Settings page.
10. Open Vercel **Logs** and inspect recent requests for HTTP 500s, Prisma errors, Auth callback failures, or email-provider failures.
11. Trigger the processor workflow manually from GitHub Actions when validating scheduler connectivity.

Record the deployment commit, migration status, profile counts, verification time, and any known limitations in the release note. Do not record secret values, full database URLs, Auth tokens, or user email addresses.

### Minimum smoke test

The shortest meaningful production smoke test is:

```text
public URL -> login/session -> dashboard -> reminders -> settings -> Vercel logs
```

The dashboard must render real content, not only an HTML shell. A Vercel **Ready** badge is not sufficient by itself.

## 17. Incident record: the first production failure

The first public failure looked like this in the browser:

```text
This page couldn’t load
A server error occurred. Reload to try again.
ERROR 2856739915
```

Vercel showed the deployment as **Ready**, but runtime logs showed HTTP 500 for `GET /`:

```text
PrismaClientKnownRequestError P2021:
The table public.user_profiles does not exist in the current database.
```

The root cause was a schema/runtime mismatch. The repository contained the `user_profiles` migration, but the production database had no application migrations applied. The Vercel build ran `next build`; it did not run `prisma migrate deploy`, so a green build did not guarantee a usable database.

The browser’s minified React error `#441` was a secondary symptom of the server response and not the root cause. Always inspect Vercel runtime logs before changing client components when the page fails during server rendering.

The repair sequence was:

1. Confirm the production database target without exposing credentials.
2. Apply all seven pending Prisma migrations.
3. Reload the public page and inspect the new runtime result.
4. Discover the next error, `Dashboard settings are not configured`, which meant the table existed but existing Auth users had no profiles.
5. Apply `infra/supabase/001-profile-sync.sql`.
6. Backfill the three existing Auth users into `public.user_profiles` with explicit timestamps.
7. Verify three Auth users, three profiles, zero missing profiles, two profile triggers, and an up-to-date migration status.
8. Reload the dashboard and smoke-test `/reminders`.

The public dashboard then rendered successfully and Vercel’s current error filter returned zero errors.
