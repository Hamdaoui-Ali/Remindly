'use client';

import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { createBrowserSupabaseClient } from '@/lib/supabase/client';

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signOut = async () => {
    setPending(true);
    setError(null);
    try {
      const { error: signOutError } = await createBrowserSupabaseClient().auth.signOut();
      if (signOutError) throw signOutError;
      router.push('/login');
    } catch {
      setError('Unable to sign out. Please try again.');
      setPending(false);
    }
  };

  return (
    <div className="sidebar__sign-out">
      <button type="button" onClick={signOut} disabled={pending} aria-busy={pending}>
        <LogOut aria-hidden="true" size={18} strokeWidth={1.75} />
        <span>{pending ? 'Signing out...' : 'Sign out'}</span>
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
