const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function sessionCookieName(nodeEnv = process.env.NODE_ENV) {
  return nodeEnv === 'production'
    ? '__Secure-remindly.session-token'
    : 'remindly.session-token';
}

export function sessionCookieOptions(nodeEnv = process.env.NODE_ENV) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: nodeEnv === 'production',
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export { SESSION_MAX_AGE_SECONDS };
