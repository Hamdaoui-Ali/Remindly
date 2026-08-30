import { describe, expect, it, vi } from 'vitest';

import { reconcileProfiles } from '@/server/profile/reconcile';

const authUsers = [
  { id: 'user-a', email: 'a-new@example.com', emailConfirmedAt: new Date('2026-08-30T12:00:00.000Z') },
  { id: 'user-b', email: 'b@example.com', emailConfirmedAt: null },
];

describe('reconcileProfiles', () => {
  it('reports missing, stale, and orphaned profiles without exposing email addresses', async () => {
    const upsert = vi.fn();
    const result = await reconcileProfiles({
      dryRun: true,
      authUsers,
      profiles: [
        { id: 'user-a', email: 'a-old@example.com', emailVerifiedAt: null },
        { id: 'orphan', email: 'orphan@example.com', emailVerifiedAt: null },
      ],
      upsert,
    });

    expect(result).toEqual({
      created: 1,
      updated: 1,
      orphanedProfileIds: ['orphan'],
      dryRun: true,
    });
    expect(JSON.stringify(result)).not.toContain('@');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('creates missing profiles with safe defaults when not in dry-run mode', async () => {
    const upsert = vi.fn();

    await reconcileProfiles({
      dryRun: false,
      authUsers: [authUsers[1]],
      profiles: [],
      upsert,
    });

    expect(upsert).toHaveBeenCalledWith({
      id: 'user-b',
      email: 'b@example.com',
      emailVerifiedAt: null,
      timezone: 'UTC',
      defaultAlertTime: '09:00',
    });
  });

  it('does not mutate an existing profile during dry-run', async () => {
    const upsert = vi.fn();

    await reconcileProfiles({
      dryRun: true,
      authUsers: [authUsers[0]],
      profiles: [{ id: 'user-a', email: 'a-old@example.com', emailVerifiedAt: null }],
      upsert,
    });

    expect(upsert).not.toHaveBeenCalled();
  });

  it('sorts orphan profile IDs with locale-aware ordering', async () => {
    const result = await reconcileProfiles({
      dryRun: true,
      authUsers: [],
      profiles: [
        { id: 'B', email: 'b@example.com', emailVerifiedAt: null },
        { id: 'a', email: 'a@example.com', emailVerifiedAt: null },
      ],
      upsert: vi.fn(),
    });

    expect(result.orphanedProfileIds).toEqual(['a', 'B']);
  });
});
