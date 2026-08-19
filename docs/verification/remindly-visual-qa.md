# Remindly Visual QA

- Result: **PASS**
- Date: 2026-08-19
- Browser: Playwright Chromium fallback
- In-app Browser result: invocation failed with `Browser is not available: iab`
- Viewports: 1440 × 1024 desktop and 390 × 844 mobile
- Routes checked: `/`, `/reminders`, `/settings`, and the open add-reminder drawer
- Data state: four active reminder fixtures covering Overdue, Urgent, Soon, and Safe

## Evidence

| Surface | Desktop (1440 px) | Mobile (390 px) |
| --- | --- | --- |
| Dashboard | [dashboard-desktop-1440.png](screenshots/dashboard-desktop-1440.png) | [dashboard-mobile-390.png](screenshots/dashboard-mobile-390.png) |
| Reminders | [reminders-desktop-1440.png](screenshots/reminders-desktop-1440.png) | [reminders-mobile-390.png](screenshots/reminders-mobile-390.png) |
| Add reminder drawer | [reminder-drawer-desktop-1440.png](screenshots/reminder-drawer-desktop-1440.png) | [reminder-drawer-mobile-390.png](screenshots/reminder-drawer-mobile-390.png) |
| Settings | [settings-desktop-1440.png](screenshots/settings-desktop-1440.png) | [settings-mobile-390.png](screenshots/settings-mobile-390.png) |

Machine-readable viewport, focus, reduced-motion, overflow, and console results are in [qa-results.json](screenshots/qa-results.json).

## Reference comparison and mismatch ledger

Accepted references:

- `docs/design/references/remindly-dashboard.png`
- `docs/design/references/remindly-reminders.png`
- `docs/design/references/remindly-settings.png`

| Comparison point | Reference | Rendered result | Resolution |
| --- | --- | --- | --- |
| Sidebar and shell | Dark fixed desktop sidebar with wordmark, three destinations, and private workspace identity | 224 px fixed desktop sidebar with the same information hierarchy; replaced by a compact mobile header and modal navigation at 390 px | Match; responsive adaptation verified |
| Typography and spacing | Large black page headings, compact muted descriptions, airy white canvas | Same hierarchy, strong page headings, subdued supporting text, consistent 16–32 px spacing, and no clipping | Match |
| Reminder rails | Red, coral, amber, and green semantic rails | All four rails render with visible Overdue, Urgent, Soon, and Safe text labels | Match; meaning is not color-only |
| Dashboard charts | Urgency donut, outcome line chart, and deadline timeline | All three charts render with legends, plain-language summaries, and expandable data tables | Match; zero historical outcome data is a fixture-state difference |
| Reminder drawer | Right-side desktop drawer with backdrop and full form | 380 px desktop drawer and full-width mobile drawer; focus is trapped, Escape closes, and focus returns to the trigger | Match |
| Settings action placement | Primary Save action precedes secondary Cancel | First pass rendered Cancel before Save | Fixed in `src/components/settings/settings-page.tsx`; rebuilt and reverified |
| Mobile layout | No accepted mobile image; responsive behavior required by the design system | Sidebar collapses to keyboard-operable navigation, cards stack, reminder rows become labeled cards, and settings fields/actions stack | Intentional responsive adaptation |
| Page copy | Reminder reference uses “Your reminders” | Product route and navigation use the shorter “Reminders” heading consistently | Intentional product-copy deviation; no functional or hierarchy loss |

## Accessibility and interaction results

| Check | Result |
| --- | --- |
| Sidebar links reachable by keyboard with visible focus | PASS — focused link has a 3 px solid outline |
| Row action control opens and closes from the keyboard | PASS |
| Drawer focus containment | PASS — initial focus lands on the drawer close control |
| Drawer Escape behavior and focus restoration | PASS |
| Drawer fields, Cancel, and Save controls are keyboard reachable | PASS |
| Settings field and action order | PASS — Email → Timezone → Default alert time → Save changes → Cancel |
| Mobile navigation open, Escape close, and trigger focus restoration | PASS |
| `prefers-reduced-motion: reduce` | PASS — animation and transition duration collapse to `0.01ms` |
| Urgency colors have visible text equivalents | PASS |
| Charts have summaries and table fallbacks | PASS |
| Horizontal overflow at both viewports | PASS — document width equals viewport width on every route |
| Framework error overlays | PASS — none found |
| Browser console and page errors | PASS — no warnings or errors captured |

## Commands and results

- `npm run build` — PASS (production build; Next.js middleware deprecation warning only)
- Playwright production visual QA script — PASS at 1440 × 1024 and 390 × 844
- `git diff --check` — PASS
- Historical pre-fix evidence: `npm test` then invoked parallel Vitest and exposed shared singleton database interference (12 integration failures across concurrent suites).
- Current `npm test` (`vitest run --maxWorkers=1`) — PASS, 28 files and 133 tests.
- `npm run lint` — PASS
- `npm run test:e2e` — PASS, 9 tests after removing the ignored screenshot-only `.env.local`

## Remaining risks

- The in-app Browser was unavailable, so the rendered gate used the explicitly permitted Playwright Chromium fallback. Firefox, WebKit, and extension-backed browser sessions were not tested.
- Comparison was a manual visual review against the accepted PNGs, not a pixel-diff baseline.
- Integration suites share the singleton Settings row, so the supported `npm test` command serializes Vitest. A manually invoked parallel Vitest command is not a supported release gate.
- Next.js reports that the `middleware.ts` convention is deprecated in favor of `proxy`; it does not fail lint, build, or E2E.
