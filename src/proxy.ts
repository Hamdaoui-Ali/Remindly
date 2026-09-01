import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { updateSupabaseSession } from '@/lib/supabase/proxy';

const PUBLIC_PAGE_ROUTES = new Set([
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/auth/confirm',
]);

const PUBLIC_API_ROUTES = new Set([
  '/api/health',
  '/api/internal/process-due-notifications',
  '/api/internal/auth/send-email',
]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_API_ROUTES.has(pathname)) {
    return NextResponse.next();
  }

  const { response, user } = await updateSupabaseSession(request);

  if (pathname === '/reset-password') {
    return user ? response : NextResponse.redirect(new URL('/login', request.url));
  }

  if (PUBLIC_PAGE_ROUTES.has(pathname)) {
    return user ? NextResponse.redirect(new URL('/', request.url)) : response;
  }

  if (!user) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.redirect(new URL('/login', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
