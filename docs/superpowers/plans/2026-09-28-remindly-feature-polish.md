# Remindly Feature Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve auth navigation and Settings feedback while leaving reminder delivery and storage behavior unchanged.

**Architecture:** Keep auth decisions in the existing Supabase and server boundaries. Use Next.js `useRouter` only for client-side post-action navigation, and keep login action state serializable with an explicit `redirectTo` value. Derive Settings dirty state from loaded server values, render an accessible status line, and register a narrow `beforeunload` guard only while edits are unsaved.

**Tech Stack:** Next.js 16.3.1, React 19, TypeScript, Vitest, Testing Library, ESLint.

**Spec:** `docs/superpowers/specs/2026-09-28-remindly-feature-polish-design.md`

## Global Constraints

- Preserve the existing Remindly visual system in `.superdesign/design-system.md`.
- Keep authenticated route protection in `src/proxy.ts` and server-side auth boundaries; client navigation is only a post-action UX concern.
- Keep settings changes limited to `timezone` and `defaultAlertTime`.
- Do not expose scheduler secrets, provider credentials, or raw operational error details in the UI.
- Add or update tests before production behavior changes.

## Review Focus

- Login succeeds with a confirmed email: the action returns a route target and the page navigates once; test the returned target in `tests/unit/login-action.test.ts`.
- Login fails or the email is unconfirmed: no navigation target is returned and the existing generic error remains; preserve coverage in `tests/unit/login-action.test.ts`.
- Sign-out and account deletion fail: router navigation must not run and existing generic errors remain; preserve/add coverage in `tests/app/sign-out-button.test.tsx` and `tests/app/account-danger-zone.test.tsx`.
- Settings edits are dirty, then canceled or saved: the status returns to `All changes saved`; cover both transitions in `tests/app/settings-page.test.tsx`.
- Browser unload occurs while Settings is dirty versus clean: only the dirty form prevents unload; cover the event behavior in `tests/app/settings-page.test.tsx`.

### Task 1: Client auth navigation

**Files:**
- Modify: `src/app/login/actions.ts`
- Modify: `src/app/login/page.tsx`
- Modify: `src/components/layout/sign-out-button.tsx`
- Modify: `src/components/settings/account-danger-zone.tsx`
- Test: `tests/unit/login-action.test.ts`
- Test: `tests/app/sign-out-button.test.tsx`
- Test: `tests/app/account-danger-zone.test.tsx`

**Interfaces:**
- Consumes: existing `LoginState`, Supabase browser client, and existing
  optional redirect callbacks.
- Produces: `LoginState.redirectTo: '/' | null`, plus router-backed default
  redirects for sign-out and account deletion.

- [ ] **Step 1: Write failing tests** for confirmed login returning
  `redirectTo: '/'`, default sign-out calling `router.push('/login')`, and
  default account deletion calling `router.push('/login')`.
- [ ] **Step 2: Run the focused tests and verify they fail** because the
  redirect target is missing and default callbacks still use browser globals.
- [ ] **Step 3: Implement the smallest router-backed change**: add the
  serializable login target and navigate from the login page with `useRouter`
  after a successful action; use `useRouter` defaults in the two client
  components while preserving injected callbacks.
- [ ] **Step 4: Run the focused tests and verify they pass.**
- [ ] **Step 5: Commit** with `fix: use client navigation for auth redirects`.

### Task 2: Settings saved-state and unload protection

**Files:**
- Modify: `src/components/settings/settings-page.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/app/settings-page.test.tsx`

**Interfaces:**
- Consumes: existing `EditableSettings`, `loaded`, `values`, and Settings
  save/cancel handlers.
- Produces: visible `All changes saved` / `Unsaved changes` status and a
  conditional `beforeunload` guard.

- [ ] **Step 1: Write failing tests** for the initial saved status, dirty
  status after editing, status restoration after Cancel and successful Save,
  and dirty-only `beforeunload` prevention.
- [ ] **Step 2: Run the focused Settings tests and verify the new assertions
  fail** because the status and unload guard do not exist.
- [ ] **Step 3: Implement `hasUnsavedChanges`**, the accessible status line,
  and a `useEffect` that registers/removes the unload handler only while the
  form is dirty. Preserve existing validation, action order, and copy.
- [ ] **Step 4: Run the focused Settings tests and verify they pass.**
- [ ] **Step 5: Commit** with `feat: show settings save state`.

### Task 3: Lint hygiene

**Files:**
- Modify: `src/server/email/circuit-state.ts`
- Modify: `src/server/notifications/processor.ts`
- Modify: `tests/unit/send-email-route.test.ts`

**Interfaces:**
- Consumes: no runtime behavior; only unused imports and a test callback
  parameter.
- Produces: no lint warnings without changing behavior.

- [ ] **Step 1: Run the lint command and record the six existing warnings.**
- [ ] **Step 2: Remove only the unused symbols.**
- [ ] **Step 3: Run the lint command and verify zero warnings and zero errors.**
- [ ] **Step 4: Commit** with `chore: remove lint warnings`.

### Task 4: Branch verification record

**Files:**
- Create: `docs/verification/remindly-feature-polish-2026-09-28.md`

**Interfaces:**
- Consumes: fresh output from focused tests, full Vitest, lint, TypeScript,
  and build commands.
- Produces: a concise branch verification record that names any environment
  limitation without claiming unsupported coverage.

- [ ] **Step 1: Run the full supported checks with the existing local
  environment loaded without committing secrets.**
- [ ] **Step 2: Record exact commands, exit results, warning counts, and any
  blocked checks in the verification note.**
- [ ] **Step 3: Commit** with `docs: record feature polish verification`.
