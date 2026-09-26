'use client';

import { useMemo, useState, type FormEvent, type RefObject } from 'react';
import { fromZonedTime } from 'date-fns-tz';
import { Plus, Trash2 } from 'lucide-react';

import { reminderRequest, ReminderRequestError } from '@/app/(protected)/reminders/actions';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { Field } from '@/components/ui/field';
import { InlineNotice } from '@/components/ui/inline-notice';
import { Select } from '@/components/ui/select';
import type { ReminderListPresentation } from '@/server/reminders/presenters';
import {
  calculateAlertAt,
  calculateLeadDays,
  calculateReminderDate,
} from '@/server/urgency/scheduling';

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
  customAlertDate: string;
  alertTime: string;
  alerts: FormAlert[];
};

type FormAlert = {
  kind: 'offset' | 'absolute';
  offsetMinutes: string;
  scheduledFor: string;
};

const CUSTOM_LEAD_DAYS = 'custom';
const PRESET_LEAD_DAYS = new Set(['1', '3', '7', '14', '30']);
const FORM_FIELD_NAMES = new Set(['name', 'endDate', 'leadDays', 'customAlertDate', 'alertTime']);

const LEAD_OPTIONS = [
  ['0', 'Same day', true],
  ['1', '1 day before', false],
  ['3', '3 days before', false],
  ['7', '7 days before', false],
  ['14', '14 days before', false],
  ['30', '30 days before', false],
  [CUSTOM_LEAD_DAYS, 'Custom date and time', false],
] as const;

function selectedLeadDays(values: FormValues): number {
  return values.leadDays === CUSTOM_LEAD_DAYS
    ? calculateLeadDays(values.endDate, values.customAlertDate)
    : Number(values.leadDays);
}

function selectedLeadDaysForDisplay(values: FormValues): number | null {
  try {
    return selectedLeadDays(values);
  } catch {
    return null;
  }
}

function initialValues(mode: DrawerMode, reminder: ReminderListPresentation | null, defaultAlertTime: string): FormValues {
  if (reminder && mode !== 'add') {
    const storedLeadDays = String(reminder.alertLeadDays);
    const preset = PRESET_LEAD_DAYS.has(storedLeadDays);
    return {
      name: reminder.name,
      endDate: reminder.endDate,
      leadDays: preset ? storedLeadDays : CUSTOM_LEAD_DAYS,
      customAlertDate: preset
        ? ''
        : calculateReminderDate(reminder.endDate, reminder.alertLeadDays),
      alertTime: reminder.alertTime,
      alerts: reminder.alerts?.length
        ? reminder.alerts.map((alert) => ({
            kind: alert.offsetMinutes === null ? 'absolute' : 'offset',
            offsetMinutes: String(alert.offsetMinutes ?? ''),
            scheduledFor: alert.scheduledFor.slice(0, 16),
          }))
        : [{ kind: 'offset', offsetMinutes: String(reminder.alertLeadDays * 24 * 60), scheduledFor: '' }],
    };
  }
  return {
    name: '', endDate: '', leadDays: '7', customAlertDate: '', alertTime: defaultAlertTime,
    alerts: [{ kind: 'offset', offsetMinutes: '10080', scheduledFor: '' }],
  };
}

function validates(values: FormValues) {
  const errors: Partial<Record<keyof FormValues, string>> = {};
  if (!values.name.trim()) errors.name = 'Enter a reminder name.';
  if (!values.endDate) errors.endDate = 'Choose an end date.';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(values.alertTime)) errors.alertTime = 'Choose a valid alert time.';
  if (values.leadDays === CUSTOM_LEAD_DAYS) {
    if (!values.customAlertDate) {
      errors.customAlertDate = 'Choose a reminder date.';
    } else if (values.endDate) {
      try {
        if (calculateLeadDays(values.endDate, values.customAlertDate) === 0) {
          errors.customAlertDate = 'Reminder date must be before the end date.';
        }
      } catch {
        errors.customAlertDate = 'Reminder date must be on or before the end date.';
      }
    }
  }
  const firstLeadDays = selectedLeadDaysForDisplay(values);
  values.alerts.forEach((alert, index) => {
    if (alert.kind === 'offset') {
      const offsetMinutes = index === 0
        ? firstLeadDays === null ? null : firstLeadDays * 24 * 60
        : Number(alert.offsetMinutes);
      if (offsetMinutes !== null && (!Number.isInteger(offsetMinutes) || offsetMinutes <= 0)) {
        if (index === 0 && values.leadDays === CUSTOM_LEAD_DAYS) {
          errors.customAlertDate = 'Reminder date must be before the end date.';
        } else if (index === 0) {
          errors.leadDays = 'The first alert must be before the deadline.';
        } else {
          errors[`alert-${index}` as keyof FormValues] = 'Enter a positive alert offset.';
        }
      }
    }
    if (alert.kind === 'absolute' && !alert.scheduledFor) {
      errors[`alert-${index}` as keyof FormValues] = 'Choose an absolute alert time.';
    }
  });
  return errors;
}

function alertAlreadyDue(values: FormValues, timezone: string) {
  if (!values.endDate || !values.alertTime) return false;
  try {
    return calculateAlertAt({
      endDate: values.endDate,
      alertTime: values.alertTime,
      leadDays: selectedLeadDays(values),
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

  const updateAlert = (index: number, patch: Partial<FormAlert>) => {
    setValues((current) => ({
      ...current,
      alerts: current.alerts.map((alert, alertIndex) => alertIndex === index ? { ...alert, ...patch } : alert),
    }));
  };

  const addAlert = () => setValues((current) => ({
    ...current,
    alerts: [...current.alerts, { kind: 'offset', offsetMinutes: '1440', scheduledFor: '' }],
  }));

  const removeAlert = (index: number) => setValues((current) => ({
    ...current,
    alerts: current.alerts.length > 1 ? current.alerts.filter((_, alertIndex) => alertIndex !== index) : current.alerts,
  }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validates(values);
    setErrors(nextErrors);
    setRequestError(null);
    if (Object.keys(nextErrors).length > 0) return;

    const dueAt = fromZonedTime(`${values.endDate}T${values.alertTime}:00`, timezone).toISOString();
    const alerts = values.alerts.map((alert, index) => index === 0 && alert.kind === 'offset'
      ? { kind: 'offset' as const, offsetMinutes: selectedLeadDays(values) * 24 * 60 }
      : alert.kind === 'offset'
        ? { kind: 'offset' as const, offsetMinutes: Number(alert.offsetMinutes) }
        : { kind: 'absolute' as const, scheduledFor: fromZonedTime(alert.scheduledFor, timezone).toISOString() });
    const body = {
      name: values.name.trim(),
      endDate: values.endDate,
      leadDays: selectedLeadDays(values),
      alertTime: values.alertTime,
      dueAt,
      alerts,
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
        const nextErrors: Partial<Record<keyof FormValues, string>> = {};
        for (const field of FORM_FIELD_NAMES) {
          nextErrors[field as keyof FormValues] = error.fields[field]?.[0];
        }
        const unmappedMessage = Object.entries(error.fields)
          .filter(([field]) => !FORM_FIELD_NAMES.has(field))
          .flatMap(([, messages]) => messages ?? [])
          .find(Boolean);
        setErrors(nextErrors);
        setRequestError(unmappedMessage ?? null);
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
            {LEAD_OPTIONS.map(([value, label, disabled]) => <option key={value} value={value} disabled={disabled}>{label}</option>)}
          </Select>
        </Field>
        {values.leadDays === CUSTOM_LEAD_DAYS ? (
          <Field
            htmlFor="reminder-custom-alert-date"
            label="Reminder date"
            error={errors.customAlertDate}
          >
            <input
              id="reminder-custom-alert-date"
              name="customAlertDate"
              type="date"
              value={values.customAlertDate}
              onChange={(event) => update('customAlertDate', event.target.value)}
            />
          </Field>
        ) : null}
        <Field htmlFor="reminder-alert-time" label="At" error={errors.alertTime}>
          <input
            name="alertTime"
            type="time"
            value={values.alertTime}
            onChange={(event) => update('alertTime', event.target.value)}
          />
        </Field>

        <fieldset className="reminder-alerts">
          <legend>Alerts</legend>
          <p>Offset alerts move with the deadline. Absolute alerts stay fixed.</p>
          {values.alerts.map((alert, index) => (
            <div className="reminder-alerts__row" key={index}>
              <Field htmlFor={`reminder-alert-type-${index}`} label={`Alert ${index + 1} type`} error={errors[`alert-${index}` as keyof FormValues]}>
                <Select
                  name={`alertType-${index}`}
                  value={alert.kind}
                  aria-label="Alert type"
                  onChange={(event) => updateAlert(index, { kind: event.target.value as FormAlert['kind'] })}
                >
                  <option value="offset">Before deadline</option>
                  <option value="absolute">At an exact time</option>
                </Select>
              </Field>
              {alert.kind === 'offset' ? (
                <Field htmlFor={`reminder-alert-offset-${index}`} label="Minutes before">
                  <input
                    id={`reminder-alert-offset-${index}`}
                    type="number"
                    min="1"
                    value={index === 0
                      ? selectedLeadDaysForDisplay(values) === null
                        ? ''
                        : selectedLeadDaysForDisplay(values)! * 24 * 60
                      : alert.offsetMinutes}
                    onChange={(event) => index === 0
                      ? update('leadDays', String(Number(event.target.value) / (24 * 60)))
                      : updateAlert(index, { offsetMinutes: event.target.value })}
                  />
                </Field>
              ) : (
                <Field htmlFor={`reminder-alert-absolute-${index}`} label="Alert date and time">
                  <input
                    id={`reminder-alert-absolute-${index}`}
                    type="datetime-local"
                    value={alert.scheduledFor}
                    onChange={(event) => updateAlert(index, { scheduledFor: event.target.value })}
                  />
                </Field>
              )}
              <Button
                type="button"
                variant="secondary"
                aria-label={`Remove alert ${index + 1}`}
                onClick={() => removeAlert(index)}
                disabled={values.alerts.length === 1}
              >
                <Trash2 aria-hidden="true" size={16} />
              </Button>
            </div>
          ))}
          <Button type="button" variant="secondary" onClick={addAlert}>
            <Plus aria-hidden="true" size={16} />
            Add alert
          </Button>
        </fieldset>

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
