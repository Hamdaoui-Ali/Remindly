import { createHash, timingSafeEqual } from 'node:crypto';

function secretDigest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

export function schedulerSecretMatches(
  providedSecret: string | null,
  expectedSecret: string,
): boolean {
  return timingSafeEqual(
    secretDigest(providedSecret ?? ''),
    secretDigest(expectedSecret),
  );
}

export function configuredSchedulerSecret(): string | null {
  const value = process.env.SCHEDULER_SECRET;
  return typeof value === 'string' && value.trim().length >= 16 ? value : null;
}
