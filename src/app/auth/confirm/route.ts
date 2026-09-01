import { NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { confirmationRedirect, confirmationType } from '@/server/auth/confirm';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const type = confirmationType(requestUrl.searchParams.get('type'));
  if (!tokenHash || !type) {
    return NextResponse.redirect(new URL('/login?error=confirmation_failed', requestUrl.origin));
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return NextResponse.redirect(new URL('/login?error=confirmation_failed', requestUrl.origin));
    const destination = confirmationRedirect(requestUrl.searchParams.get('next'), serverEnv().APP_URL);
    return NextResponse.redirect(new URL(destination, requestUrl.origin));
  } catch {
    return NextResponse.redirect(new URL('/login?error=confirmation_failed', requestUrl.origin));
  }
}
