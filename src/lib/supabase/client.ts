'use client';

import { createBrowserClient } from '@supabase/ssr';

import { parseSupabasePublicEnv, type SupabasePublicEnv } from '@/lib/env';

export function createBrowserSupabaseClient(input: Record<string, unknown> = process.env) {
  const env: SupabasePublicEnv = parseSupabasePublicEnv(input);

  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
