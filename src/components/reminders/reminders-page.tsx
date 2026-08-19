'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { reminderRequest } from '@/app/(protected)/reminders/actions';
import { Button } from '@/components/ui/button';
import { InlineNotice } from '@/components/ui/inline-notice';
import { PageHeader } from '@/components/layout/page-header';
import type { ReminderListPresentation, ReminderPresentation } from '@/server/reminders/presenters';
import { ReminderDrawer, type DrawerMode } from './reminder-drawer';
import { ReminderGroup } from './reminder-group';

const GROUPS = [
  ['OVERDUE', 'Overdue'],
  ['URGENT', 'Urgent'],
  ['SOON', 'Soon'],
  ['SAFE', 'Safe'],
] as const;

export function RemindersPage({ reminders, defaultAlertTime, timezone = 'UTC' }: {
  reminders: ReminderListPresentation[];
  defaultAlertTime: string;
  timezone?: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState(reminders);
  const [drawer, setDrawer] = useState<{ mode: DrawerMode; reminder: ReminderListPresentation | null } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const openAdd = () => setDrawer({ mode: 'add', reminder: null });
  const closeDrawer = () => setDrawer(null);

  const saved = (mode: DrawerMode, reminder: ReminderPresentation) => {
    if (mode === 'edit') {
      setItems((current) => current.map((item) => item.id === reminder.id ? { ...item, ...reminder } : item));
    } else if (mode === 'renew' && drawer?.reminder) {
      setItems((current) => current.filter((item) => item.id !== drawer.reminder?.id));
    }
    closeDrawer();
    router.refresh();
  };

  const complete = async (reminder: ReminderListPresentation) => {
    if (!window.confirm(`Mark “${reminder.name}” as done?`)) return;
    setActionError(null);
    try {
      await reminderRequest(`/api/reminders/${reminder.id}/done`, 'POST');
      setItems((current) => current.filter((item) => item.id !== reminder.id));
      router.refresh();
    } catch {
      setActionError('We could not mark that reminder done. Please try again.');
    }
  };

  const addButton = (
    <Button onClick={openAdd}>
      <Plus aria-hidden="true" size={19} strokeWidth={1.75} />
      Add reminder
    </Button>
  );

  return (
    <main className="reminders-page">
      <PageHeader
        title="Reminders"
        description="Track every deadline and the email scheduled for it."
        action={items.length > 0 ? addButton : undefined}
      />

      {actionError ? <InlineNotice tone="error">{actionError}</InlineNotice> : null}

      {items.length === 0 ? (
        <section className="reminders-empty" aria-labelledby="reminders-empty-title">
          <h2 id="reminders-empty-title">Add your first deadline</h2>
          <p>Create a reminder once. Remindly will show its urgency and schedule one email.</p>
          {addButton}
        </section>
      ) : (
        <div className="reminders-groups">
          {GROUPS.map(([urgency, label]) => {
            const grouped = items.filter((item) => item.urgency === urgency);
            return grouped.length > 0 ? (
              <ReminderGroup
                key={urgency}
                urgency={urgency}
                label={label}
                reminders={grouped}
                onComplete={complete}
                onEdit={(reminder) => setDrawer({ mode: 'edit', reminder })}
                onRenew={(reminder) => setDrawer({ mode: 'renew', reminder })}
              />
            ) : null;
          })}
        </div>
      )}

      {drawer ? (
        <ReminderDrawer
          key={`${drawer.mode}-${drawer.reminder?.id ?? 'new'}`}
          open
          mode={drawer.mode}
          reminder={drawer.reminder}
          defaultAlertTime={defaultAlertTime}
          timezone={timezone}
          onClose={closeDrawer}
          onSaved={saved}
        />
      ) : null}
    </main>
  );
}
