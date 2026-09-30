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
  now: number | null;
};

function endDateLabel(endDate: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${endDate}T00:00:00.000Z`));
}

function scheduledLabel(reminder: ReminderListPresentation, now: number | null) {
  const scheduledEmail = reminder.scheduledEmail;
  if (!scheduledEmail) return 'Email schedule unavailable';
  const dateLabel = scheduledEmail.label
    ? scheduledEmail.label.replace(/^Scheduled email\s*/i, '')
    : new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(scheduledEmail.scheduledFor));

  if (scheduledEmail.status === 'SENT') return `Email sent ${dateLabel}`;
  if (scheduledEmail.status === 'PROCESSING') return `Sending email ${dateLabel}`;
  if (scheduledEmail.status === 'FAILED') return `Email delivery failed ${dateLabel}`;
  if (scheduledEmail.status === 'CANCELLED') return 'Email not sent';
  if (now !== null && new Date(scheduledEmail.scheduledFor).getTime() <= now) {
    return `Email overdue — not sent yet (scheduled ${dateLabel})`;
  }
  return `Scheduled email ${dateLabel}`;
}

export function ReminderRow({ now, onComplete, onEdit, onRenew, reminder }: ReminderRowProps) {
  const rowRef = useRef<HTMLElement>(null);
  const returnFocus = () => rowRef.current?.querySelector<HTMLElement>('button[aria-haspopup="dialog"]') ?? null;
  const alertCount = reminder.alerts?.length ?? 0;

  return (
    <article
      ref={rowRef}
      className={`reminder-row reminder-row--${reminder.urgency.toLowerCase()}`}
      data-reminder-id={reminder.id}
      tabIndex={-1}
      aria-label={reminder.name}
    >
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
        <span className="reminder-row__mobile-label">Email alerts</span>
        <span>
          {scheduledLabel(reminder, now)}
          {alertCount > 1 ? ` · ${alertCount} alerts` : null}
        </span>
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
