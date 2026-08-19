'use client';

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import type { DashboardMonthPoint } from '@/server/dashboard/types';

export function CompletedRenewedChart({ data }: { data: DashboardMonthPoint[] }) {
  const completed = data.reduce((sum, point) => sum + point.completed, 0);
  const renewed = data.reduce((sum, point) => sum + point.renewed, 0);
  const summary = `Over the last 6 months, ${completed} reminders were completed and ${renewed} were renewed.`;

  return (
    <section className="dashboard-panel outcome-panel" aria-labelledby="outcome-title">
      <div className="chart-panel__heading">
        <h2 id="outcome-title">Completed vs renewed</h2>
        <ul className="chart-legend chart-legend--inline" aria-label="Completed and renewed legend">
          <li><span className="chart-legend__line chart-legend__line--completed" aria-hidden="true" /><span className="chart-legend__label">Completed</span></li>
          <li><span className="chart-legend__line chart-legend__line--renewed" aria-hidden="true" /><span className="chart-legend__label">Renewed</span></li>
        </ul>
      </div>
      <p className="sr-only">{summary}</p>
      <div className="outcome-panel__body">
        <div className="outcome-chart" role="img" aria-label="Completed versus renewed chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 16, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="#D9DEE6" strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#626B78', fontSize: 12 }} tickLine={false} axisLine={{ stroke: '#D9DEE6' }} />
              <YAxis allowDecimals={false} tick={{ fill: '#626B78', fontSize: 12 }} tickLine={false} axisLine={false} />
              <Tooltip />
              <Line type="monotone" dataKey="completed" name="Completed" stroke="#0B56F0" strokeWidth={2} dot={{ r: 4, fill: '#fff', strokeWidth: 2 }} isAnimationActive={false} />
              <Line type="monotone" dataKey="renewed" name="Renewed" stroke="#078A55" strokeWidth={2} dot={{ r: 4, fill: '#fff', strokeWidth: 2 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <aside className="outcome-totals" aria-label="Six month totals">
          <p><strong>{completed} completed</strong><span>Total reminders completed</span></p>
          <p><strong>{renewed} renewed</strong><span>Reminder cycles renewed</span></p>
          <small>{data.at(0)?.label ?? ''}–{data.at(-1)?.label ?? ''}</small>
        </aside>
      </div>
      <details className="chart-data">
        <summary>View outcome data</summary>
        <table aria-label="Completed and renewed reminder data">
          <thead><tr><th scope="col">Month</th><th scope="col">Completed</th><th scope="col">Renewed</th></tr></thead>
          <tbody>{data.map((point) => <tr key={point.monthKey}><th scope="row">{point.label}</th><td>{point.completed}</td><td>{point.renewed}</td></tr>)}</tbody>
        </table>
      </details>
    </section>
  );
}
