import nextEnv from '@next/env';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthProfileUser, ExistingProfile } from '../src/server/profile/reconcile';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);

const PAGE_SIZE = 1000;

async function listAuthUsers(supabase: SupabaseClient): Promise<AuthProfileUser[]> {
  const users: AuthProfileUser[] = [];

  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error) throw new Error('Unable to read Supabase Auth users');

    users.push(...data.users.map((user) => ({
      id: user.id,
      email: user.email ?? null,
      emailConfirmedAt: user.email_confirmed_at ? new Date(user.email_confirmed_at) : null,
    })));

    if (data.users.length < PAGE_SIZE) return users;
  }
}

async function main() {
  const [{ prisma }, { createAdminSupabaseClient }, { reconcileProfiles }] = await Promise.all([
    import('../src/server/db/client'),
    import('../src/lib/supabase/admin'),
    import('../src/server/profile/reconcile'),
  ]);
  const dryRun = !process.argv.includes('--apply');
  const supabase = createAdminSupabaseClient();
  const [authUsers, profiles] = await Promise.all([
    listAuthUsers(supabase),
    prisma.userProfile.findMany({
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        timezone: true,
        defaultAlertTime: true,
      },
    }) as Promise<ExistingProfile[]>,
  ]);

  const result = await reconcileProfiles({
    authUsers,
    profiles,
    dryRun,
    upsert: async (profile) => {
      await prisma.userProfile.upsert({
        where: { id: profile.id },
        create: profile,
        update: {
          email: profile.email,
          emailVerifiedAt: profile.emailVerifiedAt,
        },
      });
    },
  });

  console.info(JSON.stringify(result));

  await prisma.$disconnect();
}

try {
  await main();
} catch {
  console.error('Supabase profile reconciliation failed');
  process.exitCode = 1;
}
