import { DashboardPage } from '@/components/dashboard/dashboard-page';
import { requireUser } from '@/server/auth/require-user';
import { getDashboardData } from '@/server/dashboard/queries';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const user = await requireUser();
  return <DashboardPage data={await getDashboardData(user.id, new Date())} />;
}
