import { BellRing, CalendarDays, CircleAlert, CircleCheck } from 'lucide-react';

import type { DashboardSummary } from '@/server/dashboard/types';

const summaryItems = [
  { key: 'activeReminders', label: 'Active reminders', icon: BellRing, tone: 'primary' },
  { key: 'overdue', label: 'Overdue', icon: CircleAlert, tone: 'overdue' },
  { key: 'dueInSevenDays', label: 'Due in 7 days', icon: CalendarDays, tone: 'soon' },
  { key: 'sentThisMonth', label: 'Sent this month', icon: CircleCheck, tone: 'safe' },
] as const;

export function SummaryStrip({ summary }: { summary: DashboardSummary }) {
  return (
    <section className="summary-strip" aria-label="Reminder summary">
      {summaryItems.map(({ icon: Icon, key, label, tone }) => (
        <div className="summary-strip__item" key={key}>
          <span className={`summary-strip__icon summary-strip__icon--${tone}`} aria-hidden="true">
            <Icon size={23} strokeWidth={1.75} />
          </span>
          <span>
            <span className="summary-strip__label">{label}</span>
            <strong>{summary[key]}</strong>
          </span>
        </div>
      ))}
    </section>
  );
}
