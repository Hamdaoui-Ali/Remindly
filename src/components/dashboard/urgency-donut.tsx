'use client';

import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';

import type { UrgencyCounts } from '@/server/dashboard/types';

const URGENCY = [
  { key: 'OVERDUE', label: 'Overdue', color: '#B91C1C' },
  { key: 'URGENT', label: 'Urgent', color: '#FF4A3D' },
  { key: 'SOON', label: 'Soon', color: '#F59E0B' },
  { key: 'SAFE', label: 'Safe', color: '#078A55' },
] as const;

export function UrgencyDonut({ counts }: { counts: UrgencyCounts }) {
  const data = URGENCY.map((item) => ({ ...item, value: counts[item.key] }));
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const summary = `${total} active reminders: ${counts.OVERDUE} overdue, ${counts.URGENT} urgent, ${counts.SOON} soon, and ${counts.SAFE} safe.`;

  return (
    <section className="dashboard-panel urgency-panel" aria-labelledby="urgency-title">
      <h2 id="urgency-title">Reminder urgency</h2>
      <p className="sr-only">{summary}</p>
      <div className="urgency-panel__body">
        <div className="urgency-chart" role="img" aria-label="Reminder urgency chart">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="label" innerRadius="57%" outerRadius="88%" stroke="#fff" strokeWidth={2} isAnimationActive={false}>
                {data.map((item) => <Cell key={item.key} fill={item.color} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <span className="urgency-chart__total" aria-hidden="true"><strong>{total}</strong><small>Total</small></span>
        </div>
        <ul className="chart-legend urgency-legend" aria-label="Reminder urgency legend">
          {data.map((item) => (
            <li key={item.key}>
              <span className="chart-legend__swatch" style={{ backgroundColor: item.color }} aria-hidden="true" />
              <span className="chart-legend__label">{item.label}</span>
              <strong>{item.value}</strong>
              <span>{total === 0 ? 0 : Math.round((item.value / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
      <details className="chart-data">
        <summary>View urgency data</summary>
        <table aria-label="Reminder urgency data">
          <thead><tr><th scope="col">Urgency</th><th scope="col">Reminders</th><th scope="col">Percent</th></tr></thead>
          <tbody>{data.map((item) => <tr key={item.key}><th scope="row">{item.label}</th><td>{item.value}</td><td>{total === 0 ? 0 : Math.round((item.value / total) * 100)}%</td></tr>)}</tbody>
        </table>
      </details>
    </section>
  );
}
