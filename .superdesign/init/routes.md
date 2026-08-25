# Route map

| URL | Entry | Surface |
|---|---|---|
| `/login` | `src/app/login/page.tsx` | Owner sign-in |
| `/` | `src/app/(protected)/page.tsx` | Dashboard aggregates and charts |
| `/reminders` | `src/app/(protected)/reminders/page.tsx` | Urgency-grouped active reminders |
| `/settings` | `src/app/(protected)/settings/page.tsx` | Notification email, timezone, default alert time |
| `/api/reminders` | `src/app/api/reminders/route.ts` | Authenticated reminder list/create |
| `/api/reminders/[id]` | `src/app/api/reminders/[id]/route.ts` | Read/edit reminder |
| `/api/reminders/[id]/done` | `src/app/api/reminders/[id]/done/route.ts` | Complete cycle |
| `/api/reminders/[id]/renew` | `src/app/api/reminders/[id]/renew/route.ts` | Create linked renewal cycle |
| `/api/settings` | `src/app/api/settings/route.ts` | Authenticated settings read/update |
| `/api/dashboard` | `src/app/api/dashboard/route.ts` | Dashboard data |
| `/api/health` | `src/app/api/health/route.ts` | Public readiness |
| `/api/internal/process-due-notifications` | same | Secret-protected scheduler |

Protected routes share `src/app/(protected)/layout.tsx` and `AppShell`.

