import Link from 'next/link';

import type { DashboardReminderItem } from '@/server/dashboard/types';

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${value}T00:00:00.000Z`));
}

export function AttentionList({ reminders }: { reminders: DashboardReminderItem[] }) {
  return (
    <section className="dashboard-panel attention-list" aria-labelledby="attention-title">
      <h2 id="attention-title">Needs attention now</h2>
      {reminders.length > 0 ? (
        <ul className="attention-list__rows">
          {reminders.map((reminder) => (
            <li className={`attention-list__row attention-list__row--${reminder.urgency.toLowerCase()}`} key={reminder.id}>
              <span className="attention-list__rail" aria-hidden="true" />
              <span className="attention-list__name">
                <strong>{reminder.name}</strong>
                <small>End date: <time dateTime={reminder.endDate}>{formatDate(reminder.endDate)}</time></small>
              </span>
              <strong className="attention-list__relative">{reminder.relativeTime}</strong>
              <Link href={`/reminders?focus=${reminder.id}`}>Review reminder</Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="dashboard-empty-line">Nothing is overdue or due in the next 3 days.</p>
      )}
      <Link className="attention-list__all" href="/reminders">View all reminders <span aria-hidden="true">→</span></Link>
    </section>
  );
}
