export interface AuthProfileUser {
  id: string;
  email: string | null;
  emailConfirmedAt: Date | null;
}

export interface ExistingProfile {
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
  timezone?: string;
  defaultAlertTime?: string;
}

export interface ReconciledProfile {
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
  timezone: string;
  defaultAlertTime: string;
}

export interface ProfileReconciliationInput {
  authUsers: AuthProfileUser[];
  profiles: ExistingProfile[];
  dryRun: boolean;
  upsert: (profile: ReconciledProfile) => Promise<unknown>;
}

export interface ProfileReconciliationResult {
  created: number;
  updated: number;
  orphanedProfileIds: string[];
  dryRun: boolean;
}

function sameDate(left: Date | null, right: Date | null): boolean {
  return left?.getTime() === right?.getTime();
}

export async function reconcileProfiles(input: ProfileReconciliationInput): Promise<ProfileReconciliationResult> {
  const profilesById = new Map(input.profiles.map((profile) => [profile.id, profile]));
  const authUserIds = new Set(input.authUsers.map((user) => user.id));
  let created = 0;
  let updated = 0;

  for (const user of input.authUsers) {
    if (!user.email) continue;

    const current = profilesById.get(user.id);
    const next: ReconciledProfile = {
      id: user.id,
      email: user.email,
      emailVerifiedAt: user.emailConfirmedAt,
      timezone: 'UTC',
      defaultAlertTime: '09:00',
    };

    if (!current) {
      created += 1;
      if (!input.dryRun) await input.upsert(next);
      continue;
    }

    if (current.email !== next.email || !sameDate(current.emailVerifiedAt, next.emailVerifiedAt)) {
      updated += 1;
      if (!input.dryRun) {
        await input.upsert({
          ...next,
          timezone: current.timezone ?? 'UTC',
          defaultAlertTime: current.defaultAlertTime ?? '09:00',
        });
      }
    }
  }

  return {
    created,
    updated,
    orphanedProfileIds: input.profiles
      .filter((profile) => !authUserIds.has(profile.id))
      .map((profile) => profile.id)
      .sort((left, right) => left.localeCompare(right)),
    dryRun: input.dryRun,
  };
}
