import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { parseAuthEnv, type AuthEnv } from '@/lib/env';
import { sessionCookieName } from '@/server/auth/session-cookie';

const PUBLIC_PAGE = '/login';
const PUBLIC_API = '/api/health';
const AUTH_API_PREFIX = '/api/auth/';
const SCHEDULER_API = '/api/internal/process-due-notifications';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname === PUBLIC_API
    || pathname === SCHEDULER_API
    || pathname.startsWith(AUTH_API_PREFIX)
  ) {
    return NextResponse.next();
  }

  let authConfig: AuthEnv | null = null;
  let token = null;

  try {
    authConfig = parseAuthEnv(process.env);
  } catch {
    authConfig = null;
  }

  if (authConfig) {
    try {
      token = await getToken({
        req: request,
        secret: authConfig.AUTH_SECRET,
        cookieName: sessionCookieName(),
      });
    } catch {
      token = null;
    }
  }

  const isOwner = authConfig !== null && token?.email === authConfig.OWNER_EMAIL;

  if (pathname === PUBLIC_PAGE) {
    return isOwner ? NextResponse.redirect(new URL('/', request.url)) : NextResponse.next();
  }

  if (!isOwner) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.redirect(new URL(PUBLIC_PAGE, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
