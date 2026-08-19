import { z } from 'zod';

const authEnvSchema = z.object({
  AUTH_SECRET: z.string().min(32),
  OWNER_EMAIL: z.string().email(),
});

const envSchema = authEnvSchema.extend({
  DATABASE_URL: z.string().min(1),
  OWNER_PASSWORD_HASH: z.string().min(1),
  SCHEDULER_SECRET: z.string().min(16),
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM: z.string().min(1),
  APP_URL: z.string().url(),
  NEXTAUTH_URL: z.string().url().optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type ServerEnv = z.infer<typeof envSchema>;
export type AuthEnv = z.infer<typeof authEnvSchema>;

export function parseAuthEnv(input: Record<string, unknown>): AuthEnv {
  const env = authEnvSchema.parse(input);

  if (env.AUTH_SECRET.trim().length < 32) {
    throw new Error('AUTH_SECRET must contain at least 32 non-whitespace characters');
  }

  return env;
}

export function parseServerEnv(input: Record<string, unknown>): ServerEnv {
  const env = envSchema.parse(input);
  parseAuthEnv(env);
  return env;
}

export function serverEnv(): ServerEnv {
  return parseServerEnv(process.env);
}
