import type { Prisma, PrismaClient, Settings } from '@/generated/prisma/client';

export const SETTINGS_SINGLETON_ID = 'singleton';

export type SettingsDatabase = PrismaClient | Prisma.TransactionClient;

export interface UpdateSingletonSettings {
  notificationEmail?: string;
  timezone?: string;
  defaultAlertTime?: string;
}

export class SettingsRepository {
  constructor(private readonly db: SettingsDatabase) {}

  getSingleton(): Promise<Settings | null> {
    return this.db.settings.findUnique({ where: { id: SETTINGS_SINGLETON_ID } });
  }

  updateSingleton(patch: UpdateSingletonSettings): Promise<Settings> {
    return this.db.settings.update({
      where: { id: SETTINGS_SINGLETON_ID },
      data: patch,
    });
  }
}
