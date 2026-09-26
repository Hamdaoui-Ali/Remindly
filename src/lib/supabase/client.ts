'use client';

import { createBrowserClient } from '@supabase/ssr';

import { parseSupabasePublicEnv, type SupabasePublicEnv } from '@/lib/env';

const browserSupabaseEnv: Record<string, unknown> = {
  // Keep these as static property accesses so Next.js inlines them in the client bundle.
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
};

export function createBrowserSupabaseClient(input: Record<string, unknown> = browserSupabaseEnv) {
  const env: SupabasePublicEnv = parseSupabasePublicEnv(input);

  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
