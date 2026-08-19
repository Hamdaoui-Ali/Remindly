import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import { serverEnv } from '@/lib/env';
import { getAuthOptions } from '@/server/auth/config';

export async function requireOwner(): Promise<{ email: string }> {
  const session = await getServerSession(getAuthOptions());
  const ownerEmail = serverEnv().OWNER_EMAIL;

  if (session?.user?.email !== ownerEmail) {
    redirect('/login');
  }

  return { email: ownerEmail };
}
