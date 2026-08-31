import { beforeEach, describe, expect, it, vi } from 'vitest';

const { readState, serverEnv } = vi.hoisted(() => ({ readState: vi.fn(), serverEnv: vi.fn() }));
vi.mock('@/server/email/circuit-state', () => ({ readGmailCircuitState: readState }));
vi.mock('@/lib/env', () => ({ serverEnv }));
vi.mock('@/server/db/client', () => ({ prisma: {} }));

import { GET } from '@/app/api/internal/email-health/route';

beforeEach(() => {
  serverEnv.mockReturnValue({ SCHEDULER_SECRET: 's'.repeat(16) });
  readState.mockResolvedValue({ state: 'OPEN', failureCount: 3, openedAt: new Date('2026-08-31T12:00:00.000Z'), lastFailureCode: 'gmail_auth_revoked' });
});

describe('GET /api/internal/email-health', () => {
  it('requires the scheduler secret', async () => {
    const response = await GET(new Request('http://localhost/api/internal/email-health'));
    expect(response.status).toBe(401);
  });

  it('returns only sanitized circuit state to authorized callers', async () => {
    const response = await GET(new Request('http://localhost/api/internal/email-health', { headers: { 'x-scheduler-secret': 's'.repeat(16) } }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      state: 'open',
      failureCount: 3,
      openedAt: '2026-08-31T12:00:00.000Z',
      lastFailureCode: 'gmail_auth_revoked',
    });
  });
});
