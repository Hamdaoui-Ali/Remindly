import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import HomePage from '@/app/(protected)/page';

vi.mock('@/server/dashboard/queries', () => ({
  getDashboardData: vi.fn().mockResolvedValue({
    timezone: 'Africa/Casablanca',
    generatedForLocalDate: '2026-08-19',
    summary: { activeReminders: 0, overdue: 0, dueInSevenDays: 0, sentThisMonth: 0 },
    attention: [],
    urgencyCounts: { OVERDUE: 0, URGENT: 0, SOON: 0, SAFE: 0 },
    completedVsRenewed: [],
    nextThirtyDays: [],
  }),
}));

vi.mock('@/server/auth/require-user', () => ({
  requireUser: vi.fn().mockResolvedValue({ id: 'user-a', email: 'a@example.com' }),
}));

it('renders the operational dashboard', async () => {
  render(await HomePage());
  expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});
