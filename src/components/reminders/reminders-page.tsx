'use client';

import { Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { reminderRequest } from '@/app/(protected)/reminders/actions';
import { Button } from '@/components/ui/button';
import { InlineNotice } from '@/components/ui/inline-notice';
import { PageHeader } from '@/components/layout/page-header';
import type { ReminderListPresentation } from '@/server/reminders/presenters';
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
  const addTriggerRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const openDrawer = (mode: DrawerMode, reminder: ReminderListPresentation | null, returnFocus: HTMLElement | null) => {
    returnFocusRef.current = returnFocus;
    setDrawer({ mode, reminder });
  };
  const openAdd = () => openDrawer('add', null, addTriggerRef.current);
  const closeDrawer = () => {
    setDrawer(null);
    const target = returnFocusRef.current?.isConnected ? returnFocusRef.current : addTriggerRef.current;
    target?.focus();
  };

  const saved = (mode: DrawerMode, reminder: ReminderListPresentation) => {
    if (mode === 'edit') {
      setItems((current) => current.map((item) => item.id === reminder.id ? reminder : item));
    } else if (mode === 'renew' && drawer?.reminder) {
      setItems((current) => [...current.filter((item) => item.id !== drawer.reminder?.id), reminder]);
      returnFocusRef.current = addTriggerRef.current;
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
    <Button ref={addTriggerRef} onClick={openAdd}>
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
                onEdit={(reminder, returnFocus) => openDrawer('edit', reminder, returnFocus)}
                onRenew={(reminder, returnFocus) => openDrawer('renew', reminder, returnFocus)}
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
          returnFocusRef={returnFocusRef}
          onClose={closeDrawer}
          onSaved={saved}
        />
      ) : null}
    </main>
  );
}
