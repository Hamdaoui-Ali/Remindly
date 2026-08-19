'use client';

import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';

import type { DashboardReminderItem } from '@/server/dashboard/types';

const COLORS = { OVERDUE: '#B91C1C', URGENT: '#FF4A3D', SOON: '#F59E0B', SAFE: '#078A55' } as const;

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${value}T00:00:00.000Z`));
}

export function DeadlineTimeline({ reminders }: { reminders: DashboardReminderItem[] }) {
  const points = reminders.map((reminder, index) => ({
    ...reminder,
    day: Math.max(0, reminder.remainingCalendarDays),
    lane: (index % 3) + 1,
    fill: COLORS[reminder.urgency],
  }));
  const summary = reminders.length === 0
    ? 'No active reminders are overdue or due in the next 30 days.'
    : `${reminders.length} active reminders are overdue or due in the next 30 days. ${reminders.filter((item) => item.urgency === 'OVERDUE').length} are overdue.`;

  return (
    <section className="dashboard-panel timeline-panel" aria-labelledby="timeline-title">
      <div className="chart-panel__heading">
        <h2 id="timeline-title">Next 30 days</h2>
        <ul className="chart-legend chart-legend--inline timeline-legend" aria-label="Deadline urgency legend">
          {Object.entries(COLORS).map(([key, color]) => <li key={key}><span className="chart-legend__swatch" style={{ backgroundColor: color }} aria-hidden="true" /><span className="chart-legend__label">{key.charAt(0) + key.slice(1).toLowerCase()}</span></li>)}
        </ul>
      </div>
      <p className="sr-only">{summary}</p>
      <div className="deadline-chart" role="img" aria-label="Next 30 days deadline timeline">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 16, right: 20, bottom: 14, left: 0 }}>
            <CartesianGrid stroke="#D9DEE6" vertical={false} />
            <XAxis type="number" dataKey="day" domain={[0, 30]} ticks={[0, 5, 10, 15, 20, 25, 30]} tickFormatter={(day) => day === 0 ? 'Today / overdue' : `+${day}d`} tick={{ fill: '#626B78', fontSize: 12 }} tickLine={false} />
            <YAxis type="number" dataKey="lane" domain={[0, 4]} hide />
            <ReferenceLine x={0} stroke="#171A1F" />
            <Tooltip cursor={{ strokeDasharray: '4 4' }} formatter={(value, name, item) => name === 'day' ? [item.payload.relativeTime, 'Due'] : [value, name]} labelFormatter={(_, payload) => payload[0]?.payload?.name ?? ''} />
            <Scatter data={points} name="Deadlines" shape="circle" isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="timeline-items" aria-hidden="true">
        {reminders.slice(0, 6).map((reminder) => (
          <span key={reminder.id} style={{ borderColor: COLORS[reminder.urgency] }}>
            <strong>{formatShortDate(reminder.endDate)}</strong>
            <small>{reminder.name}</small>
          </span>
        ))}
      </div>
      <details className="chart-data">
        <summary>View deadline data</summary>
        <table aria-label="Next 30 days reminder data">
          <thead><tr><th scope="col">Reminder</th><th scope="col">End date</th><th scope="col">Urgency</th><th scope="col">Time remaining</th></tr></thead>
          <tbody>{reminders.map((reminder) => <tr key={reminder.id}><th scope="row">{reminder.name}</th><td>{formatShortDate(reminder.endDate)}</td><td>{reminder.urgency.charAt(0) + reminder.urgency.slice(1).toLowerCase()}</td><td>{reminder.relativeTime}</td></tr>)}</tbody>
        </table>
      </details>
    </section>
  );
}
