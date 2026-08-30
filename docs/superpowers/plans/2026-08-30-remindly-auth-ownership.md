# Remindly Auth and Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Supabase Auth the enforced identity authority for all user-facing Remindly data access, with per-user reminders and preferences and a protected account-deletion flow.

**Architecture:** Route handlers obtain the server-validated Supabase user once and pass `user.id` into ownership-aware services. Reminder repositories scope every read and mutation by `userId`; user profile data replaces the global `Settings` singleton for timezone, default alert time, and email identity. The legacy nullable schema columns and singleton remain available during this slice so the next migration can backfill safely.

**Tech Stack:** Next.js 16 Proxy, React 19, TypeScript, Supabase Auth with `@supabase/ssr`, Supabase admin client, Prisma 7, PostgreSQL, Vitest, integration tests.

**Spec:** `docs/REMINDLY_GMAIL_SUPABASE_VERCEL_REFACTOR_SPEC.md`, sections 5.2–5.7, 7, 9, 10, 20, 21.2, 22, 26, and SEC-001/SEC-002/SEC-003/SEC-010/SEC-011.

## Global Constraints

- Supabase Auth is the only identity authority; never accept a client-supplied `userId` as the current identity.
- User-facing reminder, alert, notification-history, dashboard, and preference queries must include the authenticated `userId` ownership condition.
- Reminder delivery destination remains the current verified `UserProfile.email`; no free-form notification email is accepted.
- The Supabase secret key is server-only and may be used only for current-user account deletion and explicit profile repair paths.
- Keep `Reminder.userId` nullable and keep the legacy singleton/settings fields until the data-backfill and multi-alert slices are complete.
- Do not make Supabase network calls in the standard unit-test suite.
- Follow Next.js 16 Proxy documentation in `node_modules/next/dist/docs/` before changing Proxy code.
- Each task ends with a focused verification and a separate commit.

---

### Task 1: Add server-only Supabase admin client and account deletion contract

**Files:**
- Create: `src/lib/supabase/admin.ts`
- Create: `src/app/api/account/route.ts`
- Modify: `src/lib/env.ts`
- Test: `tests/unit/account-route.test.ts`

**Interfaces:**
- `createAdminSupabaseClient(): SupabaseClient` consumes `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY`; it must not read cookies.
- `DELETE /api/account` consumes the current Supabase session and an allow-listed same-origin `Origin`; it returns `204` only after deleting that current Auth user.

- [ ] **Step 1: Write the failing tests**

Add route tests that mock `requireUser`, the server Supabase client, and the admin client. Cover:

```ts
it('rejects a destructive request from a different origin', async () => {
  const response = await DELETE(new Request('https://app.example/api/account', {
    method: 'DELETE',
    headers: { origin: 'https://evil.example' },
  }));
  expect(response.status).toBe(403);
});

it('deletes only the authenticated Supabase user', async () => {
  requireUser.mockResolvedValue({ id: 'user-a', email: 'a@example.com' });
  getUserWithAuthTime.mockResolvedValue({ id: 'user-a', email: 'a@example.com', authTime: Date.now() / 1000 });
  deleteUser.mockResolvedValue({ error: null });

  const response = await DELETE(new Request('https://app.example/api/account', {
    method: 'DELETE',
    headers: { origin: 'https://app.example' },
  }));

  expect(response.status).toBe(204);
  expect(deleteUser).toHaveBeenCalledWith('user-a');
});

it('requires reauthentication when auth_time is older than ten minutes', async () => {
  getUserWithAuthTime.mockResolvedValue({ id: 'user-a', email: 'a@example.com', authTime: Date.now() / 1000 - 601 });
  const response = await DELETE(requestFromAppOrigin());
  expect(response.status).toBe(401);
  expect(deleteUser).not.toHaveBeenCalled();
});
```

Use a test-local helper for the app origin. The test must assert that the route never accepts a target user ID from query parameters or a request body.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx vitest run tests/unit/account-route.test.ts --config vitest.unit.config.ts`

Expected: FAIL because the admin client and account route do not exist. If the repository has no unit-only config, create the test with the existing Vitest config and document the local PostgreSQL setup blocker instead of weakening the security assertions.

- [ ] **Step 3: Implement the minimal server-only boundary**

Implement `createAdminSupabaseClient()` with `createClient` from `@supabase/supabase-js` and `supabaseEnv()`. In the route:

1. Validate `Origin` against `APP_URL` and reject absent or mismatched origins with `403`.
2. Call `requireUser()` and obtain the current session through the server client.
3. Read `auth_time` from the validated JWT user metadata/session claims; reject missing or older-than-600-second authentication with `401`.
4. Call the admin client’s `auth.admin.deleteUser(user.id)`; return a generic `500` on failure and `204` on success.
5. Never include the deleted email or provider error details in the response.

The admin client module must be imported only by the account route and future explicit repair code; it must not be imported by ordinary repositories.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npx vitest run tests/unit/account-route.test.ts --config vitest.unit.config.ts`

Expected: all account-route tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/supabase/admin.ts src/app/api/account/route.ts src/lib/env.ts tests/unit/account-route.test.ts
git commit -m "feat: add protected Supabase account deletion"
```

### Task 2: Make reminder repository and service operations user-scoped

**Files:**
- Modify: `src/server/reminders/repository.ts`
- Modify: `src/server/reminders/service.ts`
- Modify: `src/server/notifications/repository.ts`
- Modify: `src/server/notifications/ledger.ts`
- Test: `tests/unit/reminder-ownership.test.ts`
- Test: `tests/integration/repositories.test.ts`

**Interfaces:**
- `ReminderRepository.findById(userId: string, reminderId: string)` and `findByIdWithNotifications(userId: string, reminderId: string)` use `{ id: reminderId, userId }`.
- `ReminderRepository.listActive(userId: string)` uses `{ userId, status: 'ACTIVE' }`.
- `ReminderRepository.create(userId: string, input: CreateReminderRecord)` writes `userId` from the trusted argument.
- Service methods become `createReminder(userId, input, now)`, `getReminderWithHistory(userId, id)`, `updateReminder(userId, id, patch, now)`, `completeReminder(userId, id, now)`, `renewReminder(userId, id, input, now)`, and `listActiveReminders(userId, now)`.
- Notification history and cancellation helpers receive the trusted `userId` through the reminder lookup; they must never broaden a reminder query to global access.

- [ ] **Step 1: Write failing ownership tests**

Add tests demonstrating that a repository cannot read or mutate a reminder owned by another user:

```ts
it('does not return another user\'s reminder by ID', async () => {
  const ownerReminder = await createReminderForUser('user-a');
  await expect(new ReminderRepository(prisma).findById('user-b', ownerReminder.id)).resolves.toBeNull();
});

it('does not update another user\'s reminder', async () => {
  const ownerReminder = await createReminderForUser('user-a');
  await expect(service.updateReminder('user-b', ownerReminder.id, { name: 'hijacked' }, NOW))
    .rejects.toThrow('Reminder not found');
  await expect(prisma.reminder.findUnique({ where: { id: ownerReminder.id } }))
    .resolves.toMatchObject({ name: ownerReminder.name });
});
```

Also assert that `listActive('user-a')` excludes User B’s active rows and that notification history follows the same ownership boundary.

- [ ] **Step 2: Run the focused tests and verify the expected failure**

Run: `npm test -- tests/unit/reminder-ownership.test.ts tests/integration/repositories.test.ts`

Expected: compile/signature failures or failing assertions because the current repository methods are global.

- [ ] **Step 3: Implement ownership at the repository boundary**

Add `userId` as the first argument to every user-facing reminder repository method and include it in all Prisma `where` clauses. Create records with the trusted `userId`. Keep internal notification-processor methods separate so the scheduler can continue to process globally without pretending it is a user-facing operation.

Update service transactions so the trusted user ID enters at the boundary and is used for every reminder lookup, mutation, notification cancellation, and current-schedule lookup. Keep renewal parent IDs restricted to reminders owned by the same user.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: `npm test -- tests/unit/reminder-ownership.test.ts tests/integration/repositories.test.ts`

Expected: all ownership tests pass with no cross-user reads or writes.

- [ ] **Step 5: Commit**

```powershell
git add src/server/reminders/repository.ts src/server/reminders/service.ts src/server/notifications/repository.ts src/server/notifications/ledger.ts tests/unit/reminder-ownership.test.ts tests/integration/repositories.test.ts
git commit -m "feat: scope reminder operations to authenticated users"
```

### Task 3: Replace singleton settings with user-profile preferences

**Files:**
- Create: `src/server/profile/repository.ts`
- Create: `src/server/profile/service.ts`
- Modify: `src/app/api/settings/route.ts`
- Modify: `src/app/(protected)/settings/page.tsx`
- Modify: `src/components/settings/settings-page.tsx`
- Modify: `src/app/(protected)/reminders/page.tsx`
- Modify: `src/app/api/reminders/presentation-timezone.ts`
- Test: `tests/unit/profile-service.test.ts`
- Test: `tests/app/settings-route.test.ts`

**Interfaces:**
- `ProfileRepository.findById(userId)` returns the `UserProfile` or `null`.
- `ProfileRepository.updatePreferences(userId, patch)` updates only `timezone` and `defaultAlertTime`.
- `ProfileService.getSettings(userId)` returns `{ email, emailVerified, timezone, defaultAlertTime }`.
- `ProfileService.updateSettings(userId, patch)` never accepts or writes `email` or `notificationEmail`.
- `presentationTimezone(userId)` reads `UserProfile.timezone` and returns `'UTC'` only when the profile is absent during the transitional migration state.

- [ ] **Step 1: Write failing profile tests**

Cover:

```ts
it('returns the authenticated profile email and verification status', async () => {
  await expect(service.getSettings('user-a')).resolves.toEqual({
    email: 'a@example.com',
    emailVerified: true,
    timezone: 'Africa/Casablanca',
    defaultAlertTime: '09:00',
  });
});

it('does not allow notificationEmail or email updates', async () => {
  await expect(service.updateSettings('user-a', {
    notificationEmail: 'relay@example.com',
    email: 'new@example.com',
  } as never)).rejects.toThrow();
});
```

Update route tests so the authenticated user ID is passed to the profile service and global settings are no longer read.

- [ ] **Step 2: Run focused tests and verify they fail**

Run: `npm test -- tests/unit/profile-service.test.ts tests/app/settings-route.test.ts`

Expected: FAIL because profile repository/service contracts do not exist and the route still calls `requireOwner()` and the singleton settings service.

- [ ] **Step 3: Implement profile preference access**

Use Prisma for ordinary reads/writes. Map `emailVerifiedAt !== null` to `emailVerified`. Validate timezone with `Intl.DateTimeFormat`, validate `defaultAlertTime` using the existing settings validation rule, and return a generic “settings unavailable” error when the profile is missing. Remove the free-form notification email from the settings response and update payload.

Change protected reminder pages and presentation-timezone helpers to obtain `requireUser()` and use that user’s profile timezone. Do not delete the legacy `Settings` model yet; it remains needed by old processor tests until the processor migration slice.

- [ ] **Step 4: Run focused tests and verify they pass**

Run: `npm test -- tests/unit/profile-service.test.ts tests/app/settings-route.test.ts`

Expected: profile and settings route tests pass, including rejection of arbitrary recipient changes.

- [ ] **Step 5: Commit**

```powershell
git add src/server/profile src/app/api/settings/route.ts "src/app/(protected)/settings/page.tsx" src/components/settings/settings-page.tsx "src/app/(protected)/reminders/page.tsx" src/app/api/reminders/presentation-timezone.ts tests/unit/profile-service.test.ts tests/app/settings-route.test.ts
git commit -m "feat: move user settings to Supabase profiles"
```

### Task 4: Thread authenticated identity through API routes and dashboard queries

**Files:**
- Modify: `src/app/api/reminders/route.ts`
- Modify: `src/app/api/reminders/[id]/route.ts`
- Modify: `src/app/api/reminders/[id]/done/route.ts`
- Modify: `src/app/api/reminders/[id]/renew/route.ts`
- Modify: `src/app/api/dashboard/route.ts`
- Modify: `src/app/(protected)/page.tsx`
- Modify: `src/server/dashboard/queries.ts`
- Modify: `src/server/dashboard/types.ts` if response settings change requires it
- Remove after all references are migrated: `src/server/auth/require-owner.ts`
- Test: `tests/app/reminder-routes.test.ts`
- Test: `tests/app/dashboard-route.test.ts`
- Test: `tests/integration/dashboard-queries.test.ts`

**Interfaces:**
- `getDashboardData(userId, now, db?)` filters every reminder/notification aggregate by `userId` and reads the user profile timezone.
- Every route calls `const user = await requireUser()` and passes `user.id` to its service/query.
- A valid User A session cannot access User B’s route resource even when it knows User B’s UUID.

- [ ] **Step 1: Write failing route and dashboard IDOR tests**

Change mocks from `requireOwner` to `requireUser` and assert exact trusted IDs are passed into services. Add integration coverage with two profiles/reminders:

```ts
it('dashboard data excludes reminders owned by another user', async () => {
  const dashboard = await getDashboardData('user-a', NOW, prisma);
  expect(dashboard.nextThirtyDays.map((item) => item.id)).not.toContain(userBReminder.id);
});
```

- [ ] **Step 2: Run tests and verify expected failure**

Run: `npm test -- tests/app/reminder-routes.test.ts tests/app/dashboard-route.test.ts tests/integration/dashboard-queries.test.ts`

Expected: FAIL because routes and dashboard queries still use the compatibility owner wrapper and global SQL queries.

- [ ] **Step 3: Implement identity threading and SQL ownership filters**

Replace every user-facing `requireOwner()` import/call with `requireUser()`. Pass `user.id` through all reminder service calls and settings/presentation helpers. Change dashboard SQL to add `WHERE reminder.user_id = ${userId}` and equivalent ownership conditions in count, sent-notification, compact-reminder, and outcome queries. Validate that the authenticated ID is treated as a UUID by the database boundary; do not interpolate it into SQL strings.

Update protected page loaders to use the same profile/user identity. After all references are gone, delete the compatibility helper and update tests/imports accordingly.

- [ ] **Step 4: Run focused tests and verify they pass**

Run: `npm test -- tests/app/reminder-routes.test.ts tests/app/dashboard-route.test.ts tests/integration/dashboard-queries.test.ts`

Expected: all route and dashboard isolation tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/app/api/reminders src/app/api/dashboard src/app/(protected) src/server/dashboard src/server/auth tests/app/reminder-routes.test.ts tests/app/dashboard-route.test.ts tests/integration/dashboard-queries.test.ts
git commit -m "feat: enforce Supabase user ownership across routes"
```

### Task 5: Update documentation and run the full verification gate

**Files:**
- Modify: `docs/REMINDLY_GMAIL_SUPABASE_VERCEL_REFACTOR_SPEC.md`
- Modify: `README.md`
- Modify: affected test fixtures and `.env.example` only where required by the new authenticated contracts

- [ ] **Step 1: Document the completed checkpoint**

Record that Supabase Auth identity is now threaded through all user-facing routes, profiles replace settings for user preferences, account deletion is protected by recent authentication and origin checks, and the schema remains transitional until reminder backfill and alert migration.

- [ ] **Step 2: Run the verification gate**

Run:

```powershell
npx tsc --noEmit
npm run lint
npm test
npm run build
git diff --check
git status --short --branch
```

Expected: TypeScript, lint, test, build, and diff checks complete successfully. If integration tests require local PostgreSQL and Docker is unavailable, report the exact blocked command and still run all DB-independent checks.

- [ ] **Step 3: Commit**

```powershell
git add docs/REMINDLY_GMAIL_SUPABASE_VERCEL_REFACTOR_SPEC.md README.md tests .env.example
git commit -m "docs: record authenticated ownership checkpoint"
```

## Self-Review Checklist

- [ ] Every user-facing Reminder/Notification query includes `userId`.
- [ ] Dashboard counts and lists cannot aggregate another user’s rows.
- [ ] Settings cannot edit a destination email or Auth email identity.
- [ ] Account deletion has recent-authentication and same-origin controls.
- [ ] Admin Supabase client is not imported by normal data-access code.
- [ ] Legacy singleton/schema fields remain only as an explicitly documented transition.
- [ ] No plan step contains an unresolved placeholder or unspecified function signature.
