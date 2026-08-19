import { errorResponse, jsonResponse } from '@/lib/http';
import { requireOwner } from '@/server/auth/require-owner';
import { getDashboardData } from '@/server/dashboard/queries';

export async function GET() {
  await requireOwner();
  try {
    return jsonResponse(await getDashboardData(new Date()));
  } catch {
    return errorResponse('Unable to load dashboard', 500);
  }
}
