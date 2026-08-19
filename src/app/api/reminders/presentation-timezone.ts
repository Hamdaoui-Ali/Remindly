import { prisma } from '@/server/db/client';
import { SettingsRepository } from '@/server/settings/repository';

export async function presentationTimezone() {
  const timezone = (await new SettingsRepository(prisma).getSingleton())?.timezone ?? 'UTC';
  // Validate all fallible formatter setup before a lifecycle mutation commits.
  new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date(0));
  return timezone;
}
