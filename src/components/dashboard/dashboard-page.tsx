import { Plus } from 'lucide-react';
import Link from 'next/link';

import { PageHeader } from '@/components/layout/page-header';
import type { DashboardData } from '@/server/dashboard/types';
import { AttentionList } from './attention-list';
import { CompletedRenewedChart } from './completed-renewed-chart';
import { DeadlineTimeline } from './deadline-timeline';
import { SummaryStrip } from './summary-strip';
import { UrgencyDonut } from './urgency-donut';

export function DashboardPage({ data }: { data: DashboardData }) {
  return (
    <main className="dashboard-page">
      <PageHeader
        title="Dashboard"
        description="A clear view of what needs attention."
        action={(
          <Link className="button button--primary" href="/reminders?new=1">
            <Plus aria-hidden="true" size={19} strokeWidth={1.75} />
            Add reminder
          </Link>
        )}
      />
      <div className="dashboard-grid">
        <div className="dashboard-grid__summary"><SummaryStrip summary={data.summary} /></div>
        <div className="dashboard-grid__attention"><AttentionList reminders={data.attention} /></div>
        <div className="dashboard-grid__urgency"><UrgencyDonut counts={data.urgencyCounts} /></div>
        <div className="dashboard-grid__outcomes"><CompletedRenewedChart data={data.completedVsRenewed} /></div>
        <div className="dashboard-grid__timeline"><DeadlineTimeline reminders={data.nextThirtyDays} /></div>
      </div>
    </main>
  );
}
