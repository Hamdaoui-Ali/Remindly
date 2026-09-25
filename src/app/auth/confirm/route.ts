import { NextResponse } from 'next/server';
import { appUrl } from '@/lib/env';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { confirmationRedirect, confirmationType } from '@/server/auth/confirm';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const type = confirmationType(requestUrl.searchParams.get('type'));
  if (!code && (!tokenHash || !type)) {
    return NextResponse.redirect(new URL('/login?error=confirmation_failed', requestUrl.origin));
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: type! });
    if (error) return NextResponse.redirect(new URL('/login?error=confirmation_failed', requestUrl.origin));
    const destination = confirmationRedirect(requestUrl.searchParams.get('next'), appUrl());
    return NextResponse.redirect(new URL(destination, requestUrl.origin));
  } catch {
    return NextResponse.redirect(new URL('/login?error=confirmation_failed', requestUrl.origin));
  }
}
