import { describe, expect, it } from 'vitest';
import { parseSupabaseEnv } from '@/lib/env';

describe('parseSupabaseEnv', () => {
  const validEnv = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
    SUPABASE_SECRET_KEY: 'secret-key',
  };

  it('accepts the public and server-only Supabase credentials', () => {
    expect(parseSupabaseEnv(validEnv)).toEqual(validEnv);
  });

  it('rejects a missing server-only secret key', () => {
    const { SUPABASE_SECRET_KEY: _secretKey, ...withoutSecret } = validEnv;

    expect(() => parseSupabaseEnv(withoutSecret)).toThrow('SUPABASE_SECRET_KEY');
  });

  it('rejects a non-URL Supabase project URL', () => {
    expect(() => parseSupabaseEnv({
      ...validEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'not-a-url',
    })).toThrow('NEXT_PUBLIC_SUPABASE_URL');
  });
});
