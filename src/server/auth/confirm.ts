export type ConfirmationType = 'signup' | 'recovery' | 'magiclink' | 'invite' | 'email_change';

export function confirmationType(value: string | null): ConfirmationType | null {
  return value && ['signup', 'recovery', 'magiclink', 'invite', 'email_change'].includes(value)
    ? value as ConfirmationType
    : null;
}

export function confirmationRedirect(next: string | null, appUrl: string): string {
  const base = new URL(appUrl);
  if (!next) return '/';
  try {
    const candidate = new URL(next, base);
    return candidate.origin === base.origin && candidate.pathname.startsWith('/')
      ? `${candidate.pathname}${candidate.search}${candidate.hash}`
      : '/';
  } catch {
    return '/';
  }
}
