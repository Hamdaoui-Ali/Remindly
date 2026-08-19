import { DashboardPage } from '@/components/dashboard/dashboard-page';
import { getDashboardData } from '@/server/dashboard/queries';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  return <DashboardPage data={await getDashboardData(new Date())} />;
}
