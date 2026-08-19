import { compare } from 'bcryptjs';
import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

import { serverEnv } from '@/lib/env';
import {
  SESSION_MAX_AGE_SECONDS,
  sessionCookieName,
  sessionCookieOptions,
} from '@/server/auth/session-cookie';

export async function verifyOwnerCredentials(email: string, password: string) {
  const env = serverEnv();
  let passwordMatches = false;

  try {
    passwordMatches = await compare(password, env.OWNER_PASSWORD_HASH);
  } catch {
    passwordMatches = false;
  }

  return email === env.OWNER_EMAIL && passwordMatches;
}

export function getAuthOptions(): NextAuthOptions {
  const env = serverEnv();

  return {
    secret: env.AUTH_SECRET,
    session: {
      strategy: 'jwt',
      maxAge: SESSION_MAX_AGE_SECONDS,
    },
    cookies: {
      sessionToken: {
        name: sessionCookieName(env.NODE_ENV),
        options: sessionCookieOptions(env.NODE_ENV),
      },
    },
    pages: {
      signIn: '/login',
      error: '/login',
    },
    providers: [
      CredentialsProvider({
        name: 'Owner credentials',
        credentials: {
          email: { label: 'Email', type: 'email' },
          password: { label: 'Password', type: 'password' },
        },
        async authorize(credentials) {
          const email = credentials?.email;
          const password = credentials?.password;

          if (
            typeof email !== 'string' ||
            typeof password !== 'string' ||
            !(await verifyOwnerCredentials(email, password))
          ) {
            return null;
          }

          return { id: 'owner', email: env.OWNER_EMAIL };
        },
      }),
    ],
    callbacks: {
      async session({ session, token }) {
        if (session.user && typeof token.email === 'string') {
          session.user.email = token.email;
        }

        return session;
      },
    },
  };
}
