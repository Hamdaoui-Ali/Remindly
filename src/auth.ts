import { cookies } from 'next/headers';
import { encode } from 'next-auth/jwt';

import { serverEnv } from '@/lib/env';
import { verifyOwnerCredentials } from '@/server/auth/config';
import {
  SESSION_MAX_AGE_SECONDS,
  sessionCookieName,
  sessionCookieOptions,
} from '@/server/auth/session-cookie';

export async function signInOwner(email: string, password: string) {
  if (!(await verifyOwnerCredentials(email, password))) {
    return false;
  }

  const env = serverEnv();
  const token = await encode({
    secret: env.AUTH_SECRET,
    maxAge: SESSION_MAX_AGE_SECONDS,
    token: {
      sub: 'owner',
      email: env.OWNER_EMAIL,
      name: env.OWNER_EMAIL,
    },
  });

  (await cookies()).set(
    sessionCookieName(env.NODE_ENV),
    token,
    sessionCookieOptions(env.NODE_ENV),
  );

  return true;
}
