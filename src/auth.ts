import { getServerSession } from 'next-auth';

import { getAuthOptions } from '@/server/auth/config';

export async function auth() {
  return getServerSession(getAuthOptions());
}
