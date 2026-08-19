import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getDashboardData, requireOwner } = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  getDashboardData: vi.fn(),
}));

vi.mock('@/server/auth/require-owner', () => ({ requireOwner }));
vi.mock('@/server/dashboard/queries', () => ({ getDashboardData }));

import { GET } from '@/app/api/dashboard/route';

beforeEach(() => {
  requireOwner.mockReset();
  getDashboardData.mockReset();
});

describe('GET /api/dashboard', () => {
  it('does not expose dashboard data without an owner session', async () => {
    requireOwner.mockRejectedValueOnce(new Error('NEXT_REDIRECT'));

    await expect(GET()).rejects.toThrow('NEXT_REDIRECT');
    expect(getDashboardData).not.toHaveBeenCalled();
  });

  it('returns the compact dashboard payload for the owner', async () => {
    const data = {
      timezone: 'Africa/Casablanca',
      generatedForLocalDate: '2026-08-19',
      summary: { activeReminders: 0, overdue: 0, dueInSevenDays: 0, sentThisMonth: 0 },
      attention: [],
      urgencyCounts: { OVERDUE: 0, URGENT: 0, SOON: 0, SAFE: 0 },
      completedVsRenewed: [],
      nextThirtyDays: [],
    };
    requireOwner.mockResolvedValueOnce({ email: 'owner@example.com' });
    getDashboardData.mockResolvedValueOnce(data);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(data);
  });
});
