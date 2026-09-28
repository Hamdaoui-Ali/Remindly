# Remindly Feature Polish Design

**Date:** 2026-09-28

## Goal

Make the current Remindly experience more reliable and legible without changing
the reminder data model or expanding the product beyond its private reminder
workspace.

## Scope

1. Replace browser-global navigation side effects in authentication flows with
   Next.js client navigation. Login success returns an explicit route target;
   sign-out and account deletion use the router when no callback is supplied.
2. Give the Settings screen a clear saved-state signal and protect unsaved
   timezone or alert-time edits from accidental browser unloads.
3. Remove the existing unused-symbol lint warnings and refresh verification
   notes so the branch has a clean quality baseline.

## Constraints

- Preserve the existing Remindly visual system in `.superdesign/design-system.md`.
- Keep authenticated route protection in `src/proxy.ts` and server-side auth
  boundaries; client navigation is only a post-action UX concern.
- Keep settings changes limited to `timezone` and `defaultAlertTime`.
- Do not expose scheduler secrets, provider credentials, or raw operational
  error details in the UI.
- Add or update tests before production behavior changes.

## Success criteria

- Login, sign-out, and account deletion redirect through `useRouter` without
  `window.location.assign` lint warnings.
- Settings shows `All changes saved` when clean and `Unsaved changes` while
  editable values differ from the last loaded server state.
- A dirty Settings form calls `preventDefault()` for `beforeunload`; a clean
  form does not register that guard.
- `npm run lint` has zero errors and zero warnings.
- `npx tsc --noEmit`, the focused tests, the full supported Vitest command, and
  the production build pass when run with the existing local environment.

## Out of scope

- Creating a new Open Design project or generating a separate visual direction.
- Replacing the protected operational readiness endpoint with a user-facing
  dashboard.
- Changing reminder scheduling, notification delivery semantics, or database
  schema.
