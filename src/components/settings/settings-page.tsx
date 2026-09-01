'use client';

import { ShieldCheck } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { InlineNotice } from '@/components/ui/inline-notice';
import type { UserSettings } from '@/server/profile/service';
import { isValidTimezone } from '@/server/settings/types';
import { alertTimeSchema } from '@/server/validation/reminders';
import { SettingsSection } from './settings-section';
import { AccountDangerZone } from './account-danger-zone';
import { z } from 'zod';

type EditableSettings = Pick<UserSettings, 'timezone' | 'defaultAlertTime'>;
type FieldErrors = Partial<Record<keyof EditableSettings, string>>;

const settingsInputSchema = z.object({
  timezone: z.string().trim().min(1, 'Enter a timezone').refine(isValidTimezone, 'Enter a valid IANA timezone'),
  defaultAlertTime: alertTimeSchema,
});

const TIMEZONE_SUGGESTIONS = [
  'Africa/Casablanca',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'Asia/Dubai',
];

export function SettingsPage({ settings }: { settings: UserSettings }) {
  const initial = {
    timezone: settings.timezone,
    defaultAlertTime: settings.defaultAlertTime,
  };
  const [loaded, setLoaded] = useState<EditableSettings>(initial);
  const [values, setValues] = useState<EditableSettings>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [feedback, setFeedback] = useState<{ tone: 'error' | 'success'; message: string } | null>(null);
  const [pending, setPending] = useState(false);
  const timezoneRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);

  const update = (field: keyof EditableSettings, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setFeedback(null);
  };

  const focusFirstError = (nextErrors: FieldErrors) => {
    const first = (['timezone', 'defaultAlertTime'] as const)
      .find((field) => nextErrors[field]);
    ({ timezone: timezoneRef, defaultAlertTime: timeRef })[first ?? 'timezone']
      .current?.focus();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);
    const validation = settingsInputSchema.safeParse(values);
    if (!validation.success) {
      const flattened = validation.error.flatten().fieldErrors;
      const nextErrors: FieldErrors = {
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
        settings?: UserSettings;
      };
      if (!response.ok || !payload.settings) {
        const serverErrors: FieldErrors = {
          timezone: payload.fields?.timezone?.[0],
          defaultAlertTime: payload.fields?.defaultAlertTime?.[0],
        };
        setErrors(serverErrors);
        setFeedback({ tone: 'error', message: payload.error ?? 'We could not save your settings. Please try again.' });
        if (Object.values(serverErrors).some(Boolean)) focusFirstError(serverErrors);
        return;
      }
      const saved = {
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
          title="Account email"
          description="Reminder emails are sent to your verified account email."
        >
          <Field htmlFor="account-email" label="Verified email">
            <input id="account-email" type="email" autoComplete="email" value={settings.email} readOnly />
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
          description="Your workspace is private and tied to your Supabase account."
        >
          <div className="protected-access" role="status" aria-label="Protected access enabled">
            <ShieldCheck aria-hidden="true" size={22} strokeWidth={1.75} />
            <span><strong>{settings.emailVerified ? 'Verified' : 'Unverified'}</strong><small>Authentication is managed securely by Supabase.</small></span>
          </div>
        </SettingsSection>

        <div className="settings-form__footer">
          <div aria-live="polite">
            {feedback ? <InlineNotice tone={feedback.tone}>{feedback.message}</InlineNotice> : null}
          </div>
          <div className="settings-form__actions">
            <Button type="submit" pending={pending}>Save changes</Button>
            <Button type="button" variant="secondary" disabled={pending} onClick={cancel}>Cancel</Button>
          </div>
        </div>
      </form>
      <AccountDangerZone />
    </main>
  );
}
