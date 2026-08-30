import { prisma } from '@/server/db/client';
import { isValidTimezone } from '@/server/settings/types';
import { alertTimeSchema } from '@/server/validation/reminders';
import { z } from 'zod';
import { ProfileRepository, type ProfileDatabase } from './repository';

export interface UserSettings {
  email: string;
  emailVerified: boolean;
  timezone: string;
  defaultAlertTime: string;
}

export interface UpdateUserSettingsInput {
  timezone?: string;
  defaultAlertTime?: string;
}

export const updateUserSettingsSchema = z.object({
  timezone: z.string().trim().min(1, 'Enter a timezone').refine(isValidTimezone, 'Enter a valid IANA timezone').optional(),
  defaultAlertTime: alertTimeSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one setting is required',
});

export class ProfileNotConfiguredError extends Error {
  constructor() {
    super('User profile is not configured');
    this.name = 'ProfileNotConfiguredError';
  }
}

function validatePatch(input: UpdateUserSettingsInput): UpdateUserSettingsInput {
  const parsed = updateUserSettingsSchema.parse(input);
  return parsed;
}

function present(profile: {
  email: string;
  emailVerifiedAt: Date | null;
  timezone: string;
  defaultAlertTime: string;
}): UserSettings {
  return {
    email: profile.email,
    emailVerified: profile.emailVerifiedAt !== null,
    timezone: profile.timezone,
    defaultAlertTime: profile.defaultAlertTime,
  };
}

export class ProfileService {
  constructor(private readonly db: ProfileDatabase = prisma) {}

  async getSettings(userId: string): Promise<UserSettings> {
    const profile = await new ProfileRepository(this.db).findById(userId);
    if (!profile) throw new ProfileNotConfiguredError();
    return present(profile);
  }

  async updateSettings(userId: string, input: UpdateUserSettingsInput): Promise<UserSettings> {
    const patch = validatePatch(input);
    const repository = new ProfileRepository(this.db);
    const profile = await repository.updatePreferences(userId, patch);
    return present(profile);
  }
}
