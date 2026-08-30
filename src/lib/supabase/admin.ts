import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { supabaseEnv } from '@/lib/env';

export function createAdminSupabaseClient(): SupabaseClient {
  const env = supabaseEnv();

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
