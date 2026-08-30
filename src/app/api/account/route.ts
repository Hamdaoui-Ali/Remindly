import { errorResponse } from '@/lib/http';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireUser } from '@/server/auth/require-user';

const MAX_AUTH_AGE_SECONDS = 10 * 60;

function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;

  try {
    const appUrl = process.env.APP_URL;
    return appUrl !== undefined && new URL(origin).origin === new URL(appUrl).origin;
  } catch {
    return false;
  }
}

function authTimeFromAccessToken(accessToken: string | undefined): number | null {
  if (!accessToken) return null;

  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return null;
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { auth_time?: unknown };
    return typeof decoded.auth_time === 'number' && Number.isFinite(decoded.auth_time)
      ? decoded.auth_time
      : null;
  } catch {
    return null;
  }
}

async function hasRecentAuthentication(): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getSession();
  const authTime = authTimeFromAccessToken(data.session?.access_token);

  return authTime !== null && Math.floor(Date.now() / 1000) - authTime <= MAX_AUTH_AGE_SECONDS;
}

export async function DELETE(request: Request) {
  if (!isAllowedOrigin(request)) return errorResponse('Forbidden', 403);

  const user = await requireUser();
  if (!(await hasRecentAuthentication())) return errorResponse('Recent authentication required', 401);

  const { error } = await createAdminSupabaseClient().auth.admin.deleteUser(user.id);
  if (error) return errorResponse('Unable to delete account', 500);

  return new Response(null, { status: 204 });
}
