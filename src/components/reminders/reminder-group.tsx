'use client';

import type { ReminderListPresentation } from '@/server/reminders/presenters';
import { ReminderRow } from './reminder-row';

type ReminderGroupProps = {
  label: string;
  onComplete: (reminder: ReminderListPresentation) => void;
  onEdit: (reminder: ReminderListPresentation, returnFocus: HTMLElement | null) => void;
  onRenew: (reminder: ReminderListPresentation, returnFocus: HTMLElement | null) => void;
  reminders: ReminderListPresentation[];
  urgency: ReminderListPresentation['urgency'];
};

export function ReminderGroup({ label, onComplete, onEdit, onRenew, reminders, urgency }: ReminderGroupProps) {
  const headingId = `reminder-group-${urgency.toLowerCase()}`;

  return (
    <section className="reminder-group" aria-labelledby={headingId}>
      <header className="reminder-group__header">
        <h2 id={headingId}>{label}</h2>
        <span>{reminders.length}</span>
      </header>
      <div className="reminder-columns" aria-hidden="true">
        <span>Name</span>
        <span>End date</span>
        <span>Time remaining</span>
        <span>Email alert</span>
        <span />
      </div>
      <div className="reminder-group__rows">
        {reminders.map((reminder) => (
          <ReminderRow
            key={reminder.id}
            reminder={reminder}
            onComplete={onComplete}
            onEdit={onEdit}
            onRenew={onRenew}
          />
        ))}
      </div>
    </section>
  );
}
