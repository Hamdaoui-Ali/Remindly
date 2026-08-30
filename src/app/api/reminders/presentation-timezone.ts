import { prisma } from '@/server/db/client';
import { ProfileRepository } from '@/server/profile/repository';

export async function presentationTimezone(userId: string) {
  const timezone = (await new ProfileRepository(prisma).findById(userId))?.timezone ?? 'UTC';
  // Validate all fallible formatter setup before a lifecycle mutation commits.
  new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date(0));
  return timezone;
}
