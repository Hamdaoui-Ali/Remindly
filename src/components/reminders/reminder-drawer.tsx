'use client';

import { useMemo, useState, type FormEvent, type RefObject } from 'react';

import { reminderRequest, ReminderRequestError } from '@/app/(protected)/reminders/actions';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { Field } from '@/components/ui/field';
import { InlineNotice } from '@/components/ui/inline-notice';
import { Select } from '@/components/ui/select';
import type { ReminderListPresentation } from '@/server/reminders/presenters';
import { calculateAlertAt } from '@/server/urgency/scheduling';

export type DrawerMode = 'add' | 'edit' | 'renew';

type ReminderDrawerProps = {
  defaultAlertTime: string;
  mode: DrawerMode;
  onClose: () => void;
  onSaved: (mode: DrawerMode, reminder: ReminderListPresentation) => void;
  open: boolean;
  reminder: ReminderListPresentation | null;
  timezone: string;
  returnFocusRef: RefObject<HTMLElement | null>;
};

type FormValues = {
  name: string;
  endDate: string;
  leadDays: string;
  alertTime: string;
};

const LEAD_OPTIONS = [
  ['0', 'Same day'],
  ['1', '1 day before'],
  ['3', '3 days before'],
  ['7', '7 days before'],
  ['14', '14 days before'],
  ['30', '30 days before'],
] as const;

function initialValues(mode: DrawerMode, reminder: ReminderListPresentation | null, defaultAlertTime: string): FormValues {
  if (reminder && mode !== 'add') {
    return {
      name: reminder.name,
      endDate: reminder.endDate,
      leadDays: String(reminder.alertLeadDays),
      alertTime: reminder.alertTime,
    };
  }
  return { name: '', endDate: '', leadDays: '7', alertTime: defaultAlertTime };
}

function validates(values: FormValues) {
  const errors: Partial<Record<keyof FormValues, string>> = {};
  if (!values.name.trim()) errors.name = 'Enter a reminder name.';
  if (!values.endDate) errors.endDate = 'Choose an end date.';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(values.alertTime)) errors.alertTime = 'Choose a valid alert time.';
  return errors;
}

function alertAlreadyDue(values: FormValues, timezone: string) {
  if (!values.endDate || !values.alertTime) return false;
  try {
    return calculateAlertAt({
      endDate: values.endDate,
      alertTime: values.alertTime,
      leadDays: Number(values.leadDays),
      timezone,
    }).getTime() < Date.now();
  } catch {
    return false;
  }
}

export function ReminderDrawer({ defaultAlertTime, mode, onClose, onSaved, open, reminder, returnFocusRef, timezone }: ReminderDrawerProps) {
  const [values, setValues] = useState<FormValues>(() => initialValues(mode, reminder, defaultAlertTime));
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [requestError, setRequestError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const warning = useMemo(() => alertAlreadyDue(values, timezone), [timezone, values]);
  const title = mode === 'add' ? 'Add reminder' : mode === 'edit' ? 'Edit reminder' : 'Renew reminder';
  const submitLabel = mode === 'add' ? 'Save reminder' : mode === 'edit' ? 'Save changes' : 'Renew reminder';

  const update = (field: keyof FormValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validates(values);
    setErrors(nextErrors);
    setRequestError(null);
    if (Object.keys(nextErrors).length > 0) return;

    const body = {
      name: values.name.trim(),
      endDate: values.endDate,
      leadDays: Number(values.leadDays) as 0 | 1 | 3 | 7 | 14 | 30,
      alertTime: values.alertTime,
    };
    const url = mode === 'add'
      ? '/api/reminders'
      : mode === 'edit'
        ? `/api/reminders/${reminder?.id}`
        : `/api/reminders/${reminder?.id}/renew`;

    setPending(true);
    try {
      if (mode === 'edit') {
        const result = await reminderRequest<{ reminder: ReminderListPresentation }>(url, 'PATCH', body);
        onSaved(mode, result.reminder);
      } else {
        const result = await reminderRequest<{ cycle: { reminder: ReminderListPresentation } }>(url, 'POST', body);
        onSaved(mode, result.cycle.reminder);
      }
    } catch (error) {
      if (error instanceof ReminderRequestError && error.status === 400 && error.fields) {
        setErrors({
          name: error.fields.name?.[0],
          endDate: error.fields.endDate?.[0],
          leadDays: error.fields.leadDays?.[0],
          alertTime: error.fields.alertTime?.[0],
        });
      } else {
        setRequestError('We could not save this reminder. Your values are still here—please try again.');
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <Drawer open={open} onClose={onClose} title={title} initialFocusRef={returnFocusRef}>
      <form className="reminder-form" onSubmit={submit} noValidate>
        <Field htmlFor="reminder-name" label="Name" error={errors.name}>
          <input
            name="name"
            value={values.name}
            maxLength={120}
            onChange={(event) => update('name', event.target.value)}
          />
        </Field>
        <Field htmlFor="reminder-end-date" label="End date" error={errors.endDate}>
          <input
            name="endDate"
            type="date"
            value={values.endDate}
            onChange={(event) => update('endDate', event.target.value)}
          />
        </Field>
        <Field htmlFor="reminder-lead-days" label="Remind me" error={errors.leadDays}>
          <Select name="leadDays" value={values.leadDays} onChange={(event) => update('leadDays', event.target.value)}>
            {LEAD_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </Field>
        <Field htmlFor="reminder-alert-time" label="At" error={errors.alertTime}>
          <input
            name="alertTime"
            type="time"
            value={values.alertTime}
            onChange={(event) => update('alertTime', event.target.value)}
          />
        </Field>

        {warning ? <InlineNotice>The email alert is already due. Saving will make it eligible to send now.</InlineNotice> : null}
        {requestError ? <InlineNotice tone="error">{requestError}</InlineNotice> : null}

        <div className="reminder-form__actions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" pending={pending}>{submitLabel}</Button>
        </div>
      </form>
    </Drawer>
  );
}
