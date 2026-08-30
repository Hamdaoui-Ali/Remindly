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
  APP_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
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
