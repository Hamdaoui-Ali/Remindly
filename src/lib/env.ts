import { z } from 'zod';

const supabasePublicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

const supabaseEnvSchema = supabasePublicEnvSchema.extend({
  SUPABASE_SECRET_KEY: z.string().min(1),
  SUPABASE_SEND_EMAIL_HOOK_SECRET: z.string().min(1).optional(),
});

const appUrlSchema = z.string().url();
const emptyStringAsUndefined = (value: unknown) => (
  typeof value === 'string' && value.trim() === '' ? undefined : value
);
const optionalNonEmptyString = z.preprocess(
  emptyStringAsUndefined,
  z.string().min(1).optional(),
);
const optionalEmail = z.preprocess(
  emptyStringAsUndefined,
  z.string().email().optional(),
);
const defaultPositiveInteger = (fallback: number) => z.preprocess(
  emptyStringAsUndefined,
  z.coerce.number().int().positive().default(fallback),
);
const emailProviderSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    const normalized = value.trim().toLowerCase();
    if (
      normalized.length >= 2
      && ((normalized.startsWith('"') && normalized.endsWith('"'))
        || (normalized.startsWith("'") && normalized.endsWith("'")))
    ) {
      return normalized.slice(1, -1).trim();
    }
    return normalized;
  },
  z.enum(['resend', 'gmail']).default('resend'),
);

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SCHEDULER_SECRET: z.string().min(16),
  SUPABASE_SEND_EMAIL_HOOK_SECRET: optionalNonEmptyString,
  RESEND_API_KEY: optionalNonEmptyString,
  RESEND_FROM: optionalNonEmptyString,
  REMINDER_RECIPIENT_OVERRIDE: optionalEmail,
  EMAIL_PROVIDER: emailProviderSchema,
  GMAIL_CLIENT_ID: optionalNonEmptyString,
  GMAIL_CLIENT_SECRET: optionalNonEmptyString,
  GMAIL_REFRESH_TOKEN: optionalNonEmptyString,
  GMAIL_SENDER_EMAIL: optionalEmail,
  GMAIL_SENDER_NAME: z.preprocess(
    emptyStringAsUndefined,
    z.string().min(1).default('Remindly'),
  ),
  GMAIL_TOTAL_DAILY_BUDGET: defaultPositiveInteger(350),
  GMAIL_AUTH_RESERVE: z.preprocess(
    emptyStringAsUndefined,
    z.coerce.number().int().nonnegative().default(50),
  ),
  GMAIL_REQUEST_TIMEOUT_MS: defaultPositiveInteger(10_000),
  GMAIL_AUTH_HOOK_TOTAL_TIMEOUT_MS: defaultPositiveInteger(4_000),
  APP_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
}).superRefine((value, context) => {
  if (value.EMAIL_PROVIDER === 'resend') {
    for (const key of ['RESEND_API_KEY', 'RESEND_FROM'] as const) {
      if (!value[key]) context.addIssue({ code: 'custom', path: [key], message: `${key} is required when EMAIL_PROVIDER=resend` });
    }
    return;
  }
  for (const key of ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN', 'GMAIL_SENDER_EMAIL'] as const) {
    if (!value[key]) context.addIssue({ code: 'custom', path: [key], message: `${key} is required when EMAIL_PROVIDER=gmail` });
  }
  if (value.GMAIL_AUTH_RESERVE > value.GMAIL_TOTAL_DAILY_BUDGET) {
    context.addIssue({ code: 'custom', path: ['GMAIL_AUTH_RESERVE'], message: 'GMAIL_AUTH_RESERVE cannot exceed GMAIL_TOTAL_DAILY_BUDGET' });
  }
});

function runtimeEnvironment(): Record<string, string | undefined> {
  const runtimeProcess = (globalThis as typeof globalThis & {
    process?: { env: Record<string, string | undefined> };
  }).process;
  return runtimeProcess?.env ?? {};
}

export type ServerEnv = z.infer<typeof envSchema>;
export type SupabasePublicEnv = z.infer<typeof supabasePublicEnvSchema>;
export type SupabaseEnv = z.infer<typeof supabaseEnvSchema>;

export function parseSupabasePublicEnv(input: Record<string, unknown>): SupabasePublicEnv {
  return supabasePublicEnvSchema.parse(input);
}

export function parseSupabaseEnv(input: Record<string, unknown>): SupabaseEnv {
  return supabaseEnvSchema.parse(input);
}

export function supabaseEnv(): SupabaseEnv {
  return parseSupabaseEnv(runtimeEnvironment());
}

export function parseServerEnv(input: Record<string, unknown>): ServerEnv {
  return envSchema.parse(input);
}

export function serverEnv(): ServerEnv {
  return parseServerEnv(runtimeEnvironment());
}

export function appUrl(): string {
  return appUrlSchema.parse(runtimeEnvironment().APP_URL);
}
