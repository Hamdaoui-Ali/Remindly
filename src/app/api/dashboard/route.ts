import { errorResponse, jsonResponse } from '@/lib/http';
import { requireUser } from '@/server/auth/require-user';
import { getDashboardData } from '@/server/dashboard/queries';

export async function GET() {
  const user = await requireUser();
  try {
    return jsonResponse(await getDashboardData(user.id, new Date()));
  } catch {
    return errorResponse('Unable to load dashboard', 500);
  }
}
