# Remindly Design System

## Product context

Remindly is a private, single-owner life-admin reminder application. Its core job is to let the owner record a payment or expiry deadline once, understand its urgency immediately, receive one reliable email, and then mark the reminder done or renew it.

The application has three primary pages:

- Dashboard: operational overview of urgency, upcoming deadlines, and reminder outcomes.
- Reminders: urgency-grouped reminder management.
- Settings: notification email, timezone, default alert time, and protected-access status.

The UI must remain focused on reminders. It must not become a finance dashboard, general task manager, calendar, analytics product, or AI assistant.

## Visual source of truth

- `docs/design/references/remindly-dashboard.png`
- `docs/design/references/remindly-reminders.png`
- `docs/design/references/remindly-settings.png`

These images are production design references. Preserve their hierarchy, layout, density, palette, typography character, border treatment, icon style, and visible copy unless the product specification explicitly requires a functional addition.

## Visual direction

- Theme: focused operational signal board.
- Background: true cool white main canvas.
- Navigation: dark graphite left sidebar.
- Typography: bold, highly legible Swiss-style sans serif for the interface; restrained monospaced treatment for the Remindly wordmark.
- Density: low-to-medium, with compact data presentation and generous working space.
- Containers: open page composition, horizontal bands, lists, and lightly bordered chart panels. Avoid nested cards and oversized rounded wrappers.
- Emphasis: semantic color bars, status words, readable chart labels, and a single cobalt primary action.
- Motion: short drawer and navigation transitions only; all motion respects `prefers-reduced-motion`.

## Color tokens

Use these as implementation starting values, then visually tune them against the reference images:

```text
canvas              #FFFFFF
sidebar             #111A23
sidebar-hover       #27313B
sidebar-text        #F8FAFC
text-primary        #171A1F
text-secondary      #626B78
border              #D9DEE6
surface-subtle      #F6F8FB
primary             #0B56F0
primary-hover       #0847CA
focus               #2563EB
overdue             #B91C1C
urgent              #FF4A3D
soon                #F59E0B
safe                #078A55
success             #0A8F55
```

Urgency is never communicated by color alone. Every use of an urgency color must include a visible label or equivalent accessible text.

## Typography

- UI family: Inter, with a system sans-serif fallback.
- Wordmark family: IBM Plex Mono, with a monospace fallback.
- Page title: 40px desktop, 32px tablet, 28px mobile; weight 700; tight but readable line height.
- Section title: 20-24px; weight 650-700.
- Body and controls: 15-16px; weight 400-600.
- Labels and chart text: 13-14px; never smaller than 12px.
- Numeric chart emphasis: tabular numerals where supported.

## Spacing and geometry

- Spacing scale: 4, 8, 12, 16, 24, 32, 40, 48, 64.
- Sidebar width: approximately 224px desktop.
- Page gutters: 32px desktop, 24px tablet, 16px mobile.
- Control height: 44-48px.
- Radius: 6px controls, 8px chart panels and drawers.
- Borders: 1px neutral hairline.
- Shadows: almost none; use only for the reminder drawer and transient overlays.

## Icon system

- Use Lucide icons when they match the references.
- Outline style, approximately 1.75px stroke.
- Keep icon metaphors consistent: grid for Dashboard, bell for Reminders, gear for Settings, plus for Add reminder, vertical ellipsis for reminder actions.
- Do not substitute emoji, text glyphs, filled icons, or invented decorative symbols.

## Component families

- `AppShell`: desktop sidebar, mobile top bar, content canvas.
- `SidebarNav`: Dashboard, Reminders, Settings, owner footer.
- `PageHeader`: title, optional support text, primary action.
- `SummaryStrip`: quiet operational totals without floating KPI cards.
- `ChartPanel`: shared heading, legend, accessible chart, and text fallback.
- `AttentionList`: overdue and urgent reminder rows.
- `ReminderGroup`: urgency heading, semantic rail, column headings, reminder rows.
- `ReminderRow`: name, end date, time remaining, scheduled email, action menu.
- `ReminderDrawer`: add/edit form and confirmation states.
- `SettingsSection`: aligned heading, description, controls, and validation.
- `Button`, `Field`, `Select`, `StatusText`, `OverflowMenu`, and `InlineNotice` primitives.

## Responsive behavior

- At desktop width, keep the sidebar fixed and the main canvas fluid.
- At tablet width, reduce gutters and stack secondary chart panels.
- At mobile width, replace the sidebar with an accessible top navigation/menu.
- Dashboard order on mobile: Needs attention, summary strip, urgency, next 30 days, completed vs renewed.
- Reminder rows become vertically grouped summaries without hiding any required field.
- Add/edit uses a full-height drawer or full-screen sheet on mobile.
- Settings controls use the full available width.

## Accessibility

- Meet WCAG 2.2 AA contrast for text and interactive states.
- Provide visible focus rings.
- Support full keyboard use for navigation, menus, drawers, forms, and dialogs.
- Trap focus inside open modal drawers and restore focus to the triggering control.
- Charts require text summaries or data tables for screen readers.
- Status and errors use text plus color.
- Motion must be disabled or reduced when the user prefers reduced motion.

## Prohibited visual drift

Do not introduce gradients, glow, glassmorphism, decorative illustrations, bento-grid styling, giant radii, nested card stacks, tiny chart labels, marketing metrics, finance balances, search, category chips, filters, AI surfaces, or calendar-integration UI.
