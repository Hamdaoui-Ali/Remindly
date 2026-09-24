# Remindly registration and password-recovery audit

Date: 2026-09-24  
Capture: Playwright Chromium fallback against the production server on `http://localhost:3001`  
Viewports: 1440 × 1024 desktop and 390 × 844 mobile

## Overall verdict

The registration and recovery entry screens are visually consistent, compact,
and responsive. The highest-value improvement is clearer field-specific copy:
the current invalid registration and recovery messages say “check your details”
while only the email field is marked invalid. The reset-password screen could
not be reached without a real recovery session; the unauthenticated boundary
correctly returns the user to sign in.

## Evidence and step findings

### 1. Registration — empty desktop state

Evidence: [01-register-empty.png](01-register-empty.png)

Health: Good.

- The title, supporting copy, three labeled fields, primary action, and sign-in
  link form a clear first-use path.
- The card is centered with comfortable whitespace and matches the existing
  login visual language.
- The form does not expose password requirements before entry; the later
  validation behavior supplies only a generic error.

### 2. Registration — empty mobile state

Evidence: [02-register-mobile.png](02-register-mobile.png)

Health: Good.

- The card fits the 390px viewport without horizontal overflow.
- The title wraps naturally and the fields/actions remain large enough to use.
- The single footer link stays visible below the primary action.

### 3. Password recovery — empty state

Evidence: [03-forgot-empty.png](03-forgot-empty.png)

Health: Good.

- “Reset your password” and “We’ll send a secure link to your account email”
  explain the task before the user types.
- The primary action is specific: “Send reset link”.
- “Back to sign in” provides a clear escape route.

### 4. Registration — invalid email state

Evidence: [04-register-invalid.png](04-register-invalid.png)

Health: Needs refinement.

- Focus returns to the email field and the field has a visible invalid state.
- The alert is announced through `role="alert"` and the error is placed before
  the primary action, which keeps the correction path visible.
- The message “Unable to create your account. Please check your details and try
  again.” is broad for a malformed email and does not tell the user what to fix.
- Recommendation: use field-specific validation copy for local email/password/
  confirmation failures, while retaining a generic message only for provider or
  server failures.

### 5. Password recovery — invalid email state

Evidence: [05-forgot-invalid.png](05-forgot-invalid.png)

Health: Needs refinement.

- Focus returns to the email field and the invalid border is visible.
- The alert is announced and the reset action remains available.
- The message is similarly broad: “Please check your details” does not identify
  an invalid email format. Recommendation: distinguish malformed input from a
  provider failure while preserving account-enumeration-safe copy for valid
  unknown addresses.

### 6. Reset-password route — unauthenticated boundary

Evidence: [06-reset-unauthenticated.png](06-reset-unauthenticated.png)

Health: Correct boundary; flow coverage blocked.

- Without a recovery session, `/reset-password` redirects to the sign-in page.
- This is an appropriate security boundary, but it prevented auditing the new
  password form, success message, and recovery-link handoff.

## Accessibility notes

- Labels are visibly associated with their inputs and the captured focus states
  are clear.
- Error messages use `role="alert"`, and invalid inputs expose
  `aria-invalid="true"` in the captured invalid states.
- Screenshot evidence cannot establish full keyboard order, screen-reader
  announcement timing, reduced-motion behavior, or focus restoration after
  navigation. Those require interaction tests.

## Limits and setup notes

- The in-app browser was unavailable, so Playwright Chromium was used as the
  permitted local fallback.
- The first development-server capture was rejected because the local `.env`
  lacks `SUPABASE_SECRET_KEY` and rendered a runtime validation error. The
  accepted captures used a process-only placeholder value; `.env` was not
  changed.
- The reset-password success path needs a valid Supabase recovery session or a
  dedicated test fixture before it can be audited.
