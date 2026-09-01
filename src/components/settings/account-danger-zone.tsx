'use client';

import { useState } from 'react';

import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { InlineNotice } from '@/components/ui/inline-notice';

export function AccountDangerZone({ onDeleted = () => window.location.assign('/login') }: { onDeleted?: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleteAccount = async () => {
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/account', { method: 'DELETE' });
      if (!response.ok) {
        if (response.status === 401) throw new Error('recent_authentication_required');
        throw new Error('account_deletion_failed');
      }
      const { error: signOutError } = await createBrowserSupabaseClient().auth.signOut();
      if (signOutError) throw signOutError;
      onDeleted();
    } catch (cause) {
      setError(cause instanceof Error && cause.message === 'recent_authentication_required'
        ? 'For your security, please sign in again before deleting your account.'
        : 'We could not delete your account. Please try again.');
      setPending(false);
    }
  };

  return (
    <section className="settings-section settings-section--danger" aria-labelledby="danger-zone-title">
      <div className="settings-section__intro">
        <h2 id="danger-zone-title">Danger zone</h2>
        <p>Delete your account and all of its reminders, alerts, and notification history.</p>
      </div>
      <div className="settings-section__content">
        {!confirming ? (
          <Button type="button" variant="secondary" onClick={() => { setError(null); setConfirming(true); }}>
            Delete account
          </Button>
        ) : (
          <div className="danger-confirmation">
            <p>This cannot be undone. Your account and all reminder data will be permanently deleted.</p>
            <div className="settings-form__actions">
              <Button type="button" variant="secondary" disabled={pending} onClick={() => setConfirming(false)}>Keep my account</Button>
              <Button type="button" pending={pending} onClick={deleteAccount}>Delete permanently</Button>
            </div>
          </div>
        )}
        {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
      </div>
    </section>
  );
}
