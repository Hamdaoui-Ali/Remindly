import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DashboardPage } from '@/components/dashboard/dashboard-page';
import type { DashboardData } from '@/server/dashboard/types';

const data: DashboardData = {
  timezone: 'Africa/Casablanca',
  generatedForLocalDate: '2026-08-19',
  summary: { activeReminders: 4, overdue: 1, dueInSevenDays: 2, sentThisMonth: 6 },
  attention: [
    {
      id: 'overdue',
      name: 'Hosting plan',
      endDate: '2026-08-17',
      urgency: 'OVERDUE',
      remainingCalendarDays: -2,
      relativeTime: '2 days overdue',
      scheduledEmail: { scheduledFor: '2026-08-17T08:00:00.000Z', label: 'Aug 17, 2026, 9:00 AM' },
    },
    {
      id: 'urgent',
      name: 'Passport renewal',
      endDate: '2026-08-21',
      urgency: 'URGENT',
      remainingCalendarDays: 2,
      relativeTime: '2 days left',
      scheduledEmail: { scheduledFor: '2026-08-16T08:00:00.000Z', label: 'Aug 16, 2026, 9:00 AM' },
    },
  ],
  urgencyCounts: { OVERDUE: 1, URGENT: 1, SOON: 1, SAFE: 1 },
  completedVsRenewed: [
    { monthKey: '2026-03', label: 'Mar 2026', completed: 2, renewed: 1 },
    { monthKey: '2026-04', label: 'Apr 2026', completed: 3, renewed: 2 },
    { monthKey: '2026-05', label: 'May 2026', completed: 4, renewed: 2 },
    { monthKey: '2026-06', label: 'Jun 2026', completed: 5, renewed: 3 },
    { monthKey: '2026-07', label: 'Jul 2026', completed: 7, renewed: 4 },
    { monthKey: '2026-08', label: 'Aug 2026', completed: 6, renewed: 5 },
  ],
  nextThirtyDays: [
    {
      id: 'overdue',
      name: 'Hosting plan',
      endDate: '2026-08-17',
      urgency: 'OVERDUE',
      remainingCalendarDays: -2,
      relativeTime: '2 days overdue',
      scheduledEmail: { scheduledFor: '2026-08-17T08:00:00.000Z', label: 'Aug 17, 2026, 9:00 AM' },
    },
    {
      id: 'soon',
      name: 'Car insurance',
      endDate: '2026-08-25',
      urgency: 'SOON',
      remainingCalendarDays: 6,
      relativeTime: '6 days left',
      scheduledEmail: { scheduledFor: '2026-08-18T08:00:00.000Z', label: 'Aug 18, 2026, 9:00 AM' },
    },
  ],
};

describe('DashboardPage', () => {
  it('renders the operational summary and attention list', () => {
    render(<DashboardPage data={data} />);

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    expect(screen.getByRole('link', { name: /add reminder/i })).toHaveAttribute('href', '/reminders?new=1');
    expect(screen.getByText('Active reminders').parentElement).toHaveTextContent('4');
    const attention = screen.getByRole('region', { name: 'Needs attention now' });
    expect(within(attention).getByText('Hosting plan')).toBeVisible();
    expect(within(attention).getByText('2 days overdue')).toBeVisible();
    expect(within(attention).getByText('Aug 17, 2026, 9:00 AM').parentElement)
      .toHaveTextContent('Scheduled: Aug 17, 2026, 9:00 AM');
  });

  it('gives every chart a visible legend, screen-reader summary, and data table', () => {
    render(<DashboardPage data={data} />);

    expect(screen.getByRole('img', { name: 'Reminder urgency chart' })).toBeVisible();
    expect(screen.getByText('4 active reminders: 1 overdue, 1 urgent, 1 soon, and 1 safe.')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Reminder urgency data' })).toBeInTheDocument();
    expect(screen.getByText('Completed', { selector: '.chart-legend__label' })).toBeVisible();
    expect(screen.getByText('Renewed', { selector: '.chart-legend__label' })).toBeVisible();
    expect(screen.getByRole('table', { name: 'Completed and renewed reminder data' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Next 30 days reminder data' })).toBeInTheDocument();
  });

  it('renders every timeline label at its calendar-day position', () => {
    const nextThirtyDays = Array.from({ length: 7 }, (_, day) => ({
      id: `timeline-${day}`,
      name: `Timeline reminder ${day + 1}`,
      endDate: `2026-08-${String(19 + day).padStart(2, '0')}`,
      urgency: day <= 3 ? 'URGENT' as const : 'SOON' as const,
      remainingCalendarDays: day,
      relativeTime: day === 0 ? 'Due today' : `${day} days left`,
      scheduledEmail: null,
    }));

    const { container } = render(<DashboardPage data={{ ...data, nextThirtyDays }} />);
    const labels = Array.from(container.querySelectorAll<HTMLElement>('[data-day-position]'));

    expect(labels).toHaveLength(7);
    expect(labels.map((label) => label.dataset.dayPosition)).toEqual(['0', '1', '2', '3', '4', '5', '6']);
    expect(labels.at(-1)).toHaveTextContent('Timeline reminder 7');
  });

  it('keeps day 28 through 30 labels anchored to their plotted edge coordinates', () => {
    const nextThirtyDays = [
      ['2026-09-16', 28],
      ['2026-09-17', 29],
      ['2026-09-18', 30],
    ].map(([endDate, day]) => ({
      id: `edge-${day}`,
      name: `Edge reminder ${day}`,
      endDate: String(endDate),
      urgency: 'SAFE' as const,
      remainingCalendarDays: Number(day),
      relativeTime: `${day} days left`,
      scheduledEmail: null,
    }));

    const { container } = render(<DashboardPage data={{ ...data, nextThirtyDays }} />);
    const labels = Array.from(container.querySelectorAll<HTMLElement>('[data-day-position]'));

    expect(labels.map((label) => label.style.gridColumn)).toEqual([
      '29 / span 1',
      '30 / span 1',
      '31 / span 1',
    ]);
    expect(labels.every((label) => label.classList.contains('timeline-items__label--edge'))).toBe(true);
  });
});
