'use client';

import { Button } from '@/components/ui/button';
import { OverflowMenu } from '@/components/ui/overflow-menu';
import { useRef } from 'react';
import type { ReminderListPresentation } from '@/server/reminders/presenters';

type ReminderRowProps = {
  onComplete: (reminder: ReminderListPresentation) => void;
  onEdit: (reminder: ReminderListPresentation, returnFocus: HTMLElement | null) => void;
  onRenew: (reminder: ReminderListPresentation, returnFocus: HTMLElement | null) => void;
  reminder: ReminderListPresentation;
};

function endDateLabel(endDate: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${endDate}T00:00:00.000Z`));
}

function scheduledLabel(reminder: ReminderListPresentation) {
  if (!reminder.scheduledEmail) return 'Email schedule unavailable';
  if (reminder.scheduledEmail.label) return reminder.scheduledEmail.label;
  return `Scheduled email ${new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(reminder.scheduledEmail.scheduledFor))}`;
}

export function ReminderRow({ onComplete, onEdit, onRenew, reminder }: ReminderRowProps) {
  const rowRef = useRef<HTMLElement>(null);
  const returnFocus = () => rowRef.current?.querySelector<HTMLElement>('button[aria-haspopup="dialog"]') ?? null;

  return (
    <article ref={rowRef} className={`reminder-row reminder-row--${reminder.urgency.toLowerCase()}`} aria-label={reminder.name}>
      <span className="reminder-row__rail" aria-hidden="true" />
      <div className="reminder-row__name">
        <strong>{reminder.name}</strong>
        <span className={`reminder-row__urgency reminder-row__urgency--${reminder.urgency.toLowerCase()}`}>
          {reminder.urgencyLabel}
        </span>
      </div>
      <div className="reminder-row__field">
        <span className="reminder-row__mobile-label">End date</span>
        <time dateTime={reminder.endDate}>{endDateLabel(reminder.endDate)}</time>
      </div>
      <div className="reminder-row__field">
        <span className="reminder-row__mobile-label">Time remaining</span>
        <span>{reminder.relativeTime}</span>
      </div>
      <div className="reminder-row__field reminder-row__email">
        <span className="reminder-row__mobile-label">Email alert</span>
        <span>{scheduledLabel(reminder)}</span>
      </div>
      <OverflowMenu label={`Actions for ${reminder.name}`}>
        <div className="reminder-row__menu">
          <Button variant="ghost" onClick={() => onEdit(reminder, returnFocus())}>Edit</Button>
          <Button variant="ghost" onClick={() => onComplete(reminder)}>Mark done</Button>
          <Button variant="ghost" onClick={() => onRenew(reminder, returnFocus())}>Renew</Button>
        </div>
      </OverflowMenu>
    </article>
  );
}
