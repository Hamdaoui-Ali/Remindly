import { z } from 'zod';

const supabasePublicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

const supabaseEnvSchema = supabasePublicEnvSchema.extend({
  SUPABASE_SECRET_KEY: z.string().min(1),
});

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),
  SCHEDULER_SECRET: z.string().min(16),
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM: z.string().min(1),
  EMAIL_PROVIDER: z.enum(['resend', 'gmail']).default('resend'),
  GMAIL_CLIENT_ID: z.string().min(1).optional(),
  GMAIL_CLIENT_SECRET: z.string().min(1).optional(),
  GMAIL_REFRESH_TOKEN: z.string().min(1).optional(),
  GMAIL_SENDER_EMAIL: z.string().email().optional(),
  GMAIL_SENDER_NAME: z.string().min(1).default('Remindly'),
  GMAIL_TOTAL_DAILY_BUDGET: z.coerce.number().int().positive().default(350),
  GMAIL_AUTH_RESERVE: z.coerce.number().int().nonnegative().default(50),
  GMAIL_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  GMAIL_AUTH_HOOK_TOTAL_TIMEOUT_MS: z.coerce.number().int().positive().default(4_000),
  APP_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
}).superRefine((value, context) => {
  if (value.EMAIL_PROVIDER !== 'gmail') return;
  for (const key of ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN', 'GMAIL_SENDER_EMAIL'] as const) {
    if (!value[key]) context.addIssue({ code: 'custom', path: [key], message: `${key} is required when EMAIL_PROVIDER=gmail` });
  }
  if (value.GMAIL_AUTH_RESERVE > value.GMAIL_TOTAL_DAILY_BUDGET) {
    context.addIssue({ code: 'custom', path: ['GMAIL_AUTH_RESERVE'], message: 'GMAIL_AUTH_RESERVE cannot exceed GMAIL_TOTAL_DAILY_BUDGET' });
  }
});

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
  return parseSupabaseEnv(process.env);
}

export function parseServerEnv(input: Record<string, unknown>): ServerEnv {
  return envSchema.parse(input);
}

export function serverEnv(): ServerEnv {
  return parseServerEnv(process.env);
}
