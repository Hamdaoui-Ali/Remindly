import { afterEach, describe, expect, it, vi } from 'vitest';

const globalForPrisma = globalThis as typeof globalThis & { prisma?: unknown };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  delete globalForPrisma.prisma;
});

describe('database client test isolation', () => {
  it('refuses direct Vitest client initialization against an app database before opening a connection', async () => {
    vi.stubEnv('VITEST', 'true');
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost/remindly');
    delete globalForPrisma.prisma;

    await expect(import('@/server/db/client')).rejects.toThrow('must end with "_test"');
  });
});
