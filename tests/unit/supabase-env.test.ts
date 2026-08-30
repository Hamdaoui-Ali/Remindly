import { describe, expect, it } from 'vitest';
import { parseSupabaseEnv, parseSupabasePublicEnv } from '@/lib/env';

describe('parseSupabaseEnv', () => {
  const validEnv = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
    SUPABASE_SECRET_KEY: 'secret-key',
  };

  it('accepts the public and server-only Supabase credentials', () => {
    expect(parseSupabaseEnv(validEnv)).toEqual(validEnv);
  });

  it('accepts public credentials without requiring the server-only secret', () => {
    const publicEnv = {
      NEXT_PUBLIC_SUPABASE_URL: validEnv.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: validEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    };

    expect(parseSupabasePublicEnv(publicEnv)).toEqual(publicEnv);
  });

  it('rejects a missing server-only secret key', () => {
    const withoutSecret = {
      NEXT_PUBLIC_SUPABASE_URL: validEnv.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: validEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    };

    expect(() => parseSupabaseEnv(withoutSecret)).toThrow('SUPABASE_SECRET_KEY');
  });

  it('rejects a non-URL Supabase project URL', () => {
    expect(() => parseSupabaseEnv({
      ...validEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'not-a-url',
    })).toThrow('NEXT_PUBLIC_SUPABASE_URL');
  });
});
