import { afterEach, describe, expect, it, vi } from 'vitest';

const { createBrowserClient, originalSupabaseUrl, originalPublishableKey } = vi.hoisted(() => {
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalPublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test-key';

  return {
    createBrowserClient: vi.fn(),
    originalSupabaseUrl,
    originalPublishableKey,
  };
});

vi.mock('@supabase/ssr', () => ({ createBrowserClient }));

import { createBrowserSupabaseClient } from '@/lib/supabase/client';

afterEach(() => {
  if (originalSupabaseUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;

  if (originalPublishableKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalPublishableKey;

  createBrowserClient.mockReset();
});

describe('createBrowserSupabaseClient', () => {
  it('uses public Supabase values when the browser has no runtime process.env', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    expect(() => createBrowserSupabaseClient()).not.toThrow();
    expect(createBrowserClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'sb_publishable_test-key',
    );
  });
});
