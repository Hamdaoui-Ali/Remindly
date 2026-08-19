import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32),
  OWNER_EMAIL: z.string().email(),
  OWNER_PASSWORD_HASH: z.string().min(1),
  SCHEDULER_SECRET: z.string().min(16),
  RESEND_API_KEY: z.string().min(1),
  APP_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export function parseServerEnv(input: Record<string, unknown>) {
  return envSchema.parse(input);
}

export function serverEnv() {
  return parseServerEnv(process.env);
}
