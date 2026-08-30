import { requireUser } from '@/server/auth/require-user';

/**
 * Temporary compatibility name for existing repositories and route handlers.
 * The returned identity is already validated by Supabase Auth; this alias is
 * removed when the ownership-aware repository APIs land.
 */
export async function requireOwner() {
  return requireUser();
}
