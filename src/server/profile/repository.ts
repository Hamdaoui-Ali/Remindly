import type { Prisma, PrismaClient, UserProfile } from '@/generated/prisma/client';

export type ProfileDatabase = PrismaClient | Prisma.TransactionClient;

export interface UpdateProfilePreferences {
  timezone?: string;
  defaultAlertTime?: string;
}

export class ProfileRepository {
  constructor(private readonly db: ProfileDatabase) {}

  findById(userId: string): Promise<UserProfile | null> {
    return this.db.userProfile.findUnique({ where: { id: userId } });
  }

  updatePreferences(userId: string, patch: UpdateProfilePreferences): Promise<UserProfile> {
    return this.db.userProfile.update({ where: { id: userId }, data: patch });
  }
}
