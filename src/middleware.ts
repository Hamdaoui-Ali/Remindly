import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { sessionCookieName } from '@/server/auth/session-cookie';

const PUBLIC_PAGE = '/login';
const PUBLIC_API = '/api/health';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === PUBLIC_API) {
    return NextResponse.next();
  }

  const secret = process.env.AUTH_SECRET;
  const token = secret
    ? await getToken({
        req: request,
        secret,
        cookieName: sessionCookieName(),
      })
    : null;
  const isOwner = token?.email === process.env.OWNER_EMAIL;

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
