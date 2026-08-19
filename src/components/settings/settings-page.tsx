'use client';

import { ShieldCheck } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { InlineNotice } from '@/components/ui/inline-notice';
import type { OwnerSettings } from '@/server/settings/types';
import { settingsInputSchema } from '@/server/settings/types';
import { SettingsSection } from './settings-section';

type EditableSettings = Pick<OwnerSettings, 'notificationEmail' | 'timezone' | 'defaultAlertTime'>;
type FieldErrors = Partial<Record<keyof EditableSettings, string>>;

const TIMEZONE_SUGGESTIONS = [
  'Africa/Casablanca',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'Asia/Dubai',
];

export function SettingsPage({ settings }: { settings: OwnerSettings }) {
  const initial = {
    notificationEmail: settings.notificationEmail,
    timezone: settings.timezone,
    defaultAlertTime: settings.defaultAlertTime,
  };
  const [loaded, setLoaded] = useState<EditableSettings>(initial);
  const [values, setValues] = useState<EditableSettings>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [feedback, setFeedback] = useState<{ tone: 'error' | 'success'; message: string } | null>(null);
  const [pending, setPending] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const timezoneRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);

  const update = (field: keyof EditableSettings, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setFeedback(null);
  };

  const focusFirstError = (nextErrors: FieldErrors) => {
    const first = (['notificationEmail', 'timezone', 'defaultAlertTime'] as const)
      .find((field) => nextErrors[field]);
    ({ notificationEmail: emailRef, timezone: timezoneRef, defaultAlertTime: timeRef })[first ?? 'notificationEmail']
      .current?.focus();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);
    const validation = settingsInputSchema.safeParse(values);
    if (!validation.success) {
      const flattened = validation.error.flatten().fieldErrors;
      const nextErrors: FieldErrors = {
        notificationEmail: flattened.notificationEmail?.[0],
        timezone: flattened.timezone?.[0],
        defaultAlertTime: flattened.defaultAlertTime?.[0],
      };
      setErrors(nextErrors);
      focusFirstError(nextErrors);
      return;
    }

    setPending(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validation.data),
      });
      const payload = await response.json() as {
        error?: string;
        fields?: Record<string, string[]>;
        settings?: OwnerSettings;
      };
      if (!response.ok || !payload.settings) {
        const serverErrors: FieldErrors = {
          notificationEmail: payload.fields?.notificationEmail?.[0],
          timezone: payload.fields?.timezone?.[0],
          defaultAlertTime: payload.fields?.defaultAlertTime?.[0],
        };
        setErrors(serverErrors);
        setFeedback({ tone: 'error', message: payload.error ?? 'We could not save your settings. Please try again.' });
        if (Object.values(serverErrors).some(Boolean)) focusFirstError(serverErrors);
        return;
      }
      const saved = {
        notificationEmail: payload.settings.notificationEmail,
        timezone: payload.settings.timezone,
        defaultAlertTime: payload.settings.defaultAlertTime,
      };
      setLoaded(saved);
      setValues(saved);
      setErrors({});
      setFeedback({ tone: 'success', message: 'Settings saved.' });
    } catch {
      setFeedback({ tone: 'error', message: 'We could not save your settings. Please try again.' });
    } finally {
      setPending(false);
    }
  };

  const cancel = () => {
    setValues(loaded);
    setErrors({});
    setFeedback(null);
  };

  return (
    <main className="settings-page">
      <PageHeader title="Settings" description="Manage where and when Remindly sends your alerts." />
      <form className="settings-form" noValidate onSubmit={submit}>
        <SettingsSection
          title="Notifications"
          description="Choose the inbox that receives reminder emails."
        >
          <Field htmlFor="notification-email" label="Notification email" error={errors.notificationEmail}>
            <input
              ref={emailRef}
              type="email"
              autoComplete="email"
              value={values.notificationEmail}
              onChange={(event) => update('notificationEmail', event.target.value)}
            />
          </Field>
        </SettingsSection>

        <SettingsSection
          title="Time and timezone"
          description="Calendar dates and scheduled emails use this timezone."
        >
          <div className="settings-fields">
            <Field
              htmlFor="timezone"
              label="Timezone"
              description="Use an IANA timezone, for example Africa/Casablanca."
              error={errors.timezone}
            >
              <input
                ref={timezoneRef}
                type="text"
                list="timezone-suggestions"
                autoComplete="off"
                value={values.timezone}
                onChange={(event) => update('timezone', event.target.value)}
              />
            </Field>
            <datalist id="timezone-suggestions">
              {TIMEZONE_SUGGESTIONS.map((timezone) => <option key={timezone} value={timezone} />)}
            </datalist>
            <Field
              htmlFor="default-alert-time"
              label="Default alert time"
              description="Used to initialize new reminders. Existing reminder times stay unchanged."
              error={errors.defaultAlertTime}
            >
              <input
                ref={timeRef}
                type="time"
                value={values.defaultAlertTime}
                onChange={(event) => update('defaultAlertTime', event.target.value)}
              />
            </Field>
          </div>
        </SettingsSection>

        <SettingsSection
          title="Protected access"
          description="Your workspace is private and available only to the configured owner account."
        >
          <div className="protected-access" role="status" aria-label="Protected access enabled">
            <ShieldCheck aria-hidden="true" size={22} strokeWidth={1.75} />
            <span><strong>Enabled</strong><small>Owner credentials are managed securely outside this page.</small></span>
          </div>
        </SettingsSection>

        <div className="settings-form__footer">
          <div aria-live="polite">
            {feedback ? <InlineNotice tone={feedback.tone}>{feedback.message}</InlineNotice> : null}
          </div>
          <div className="settings-form__actions">
            <Button type="button" variant="secondary" disabled={pending} onClick={cancel}>Cancel</Button>
            <Button type="submit" pending={pending}>Save changes</Button>
          </div>
        </div>
      </form>
    </main>
  );
}
