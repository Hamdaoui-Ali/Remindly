import { ZodError } from 'zod';

const CONFIGURATION_FIELDS = new Set([
  'APP_URL',
  'DATABASE_URL',
  'EMAIL_PROVIDER',
  'GMAIL_AUTH_HOOK_TOTAL_TIMEOUT_MS',
  'GMAIL_AUTH_RESERVE',
  'GMAIL_CLIENT_ID',
  'GMAIL_CLIENT_SECRET',
  'GMAIL_REFRESH_TOKEN',
  'GMAIL_REQUEST_TIMEOUT_MS',
  'GMAIL_SENDER_EMAIL',
  'GMAIL_SENDER_NAME',
  'GMAIL_TOTAL_DAILY_BUDGET',
  'RESEND_API_KEY',
  'RESEND_FROM',
  'SCHEDULER_SECRET',
  'SUPABASE_SEND_EMAIL_HOOK_SECRET',
]);

export function notificationProcessorFailureCode(error: unknown): string {
  if (error instanceof ZodError) {
    const field = error.issues
      .map((issue) => issue.path[0])
      .find((value): value is string => (
        typeof value === 'string' && CONFIGURATION_FIELDS.has(value)
      ));
    if (field) return `notification_processor_config_${field}`;
  }
  return 'notification_processor_failed';
}
