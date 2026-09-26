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
