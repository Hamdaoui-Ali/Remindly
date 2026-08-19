import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireOwner } = vi.hoisted(() => ({
  requireOwner: vi.fn(async () => ({ email: 'owner@example.com' })),
}));

vi.mock('@/server/auth/require-owner', () => ({ requireOwner }));

import { GET as getReminder, PATCH as patchReminder } from '@/app/api/reminders/[id]/route';
import { POST as completeReminder } from '@/app/api/reminders/[id]/done/route';
import { POST as renewReminder } from '@/app/api/reminders/[id]/renew/route';
import { POST as createReminder } from '@/app/api/reminders/route';
import { ReminderService } from '@/server/reminders/service';
import { SettingsRepository } from '@/server/settings/repository';
import { Prisma } from '@/generated/prisma/client';
import { reminderRouteError } from '@/app/api/reminders/errors';

const malformedContext = { params: Promise.resolve({ id: 'not-a-uuid' }) };

beforeEach(() => {
  vi.restoreAllMocks();
  requireOwner.mockClear();
});

describe('reminder route identifiers', () => {
  it.each([
    ['detail', () => getReminder(new Request('http://localhost/api/reminders/not-a-uuid'), malformedContext)],
    ['edit', () => patchReminder(new Request('http://localhost/api/reminders/not-a-uuid', {
      method: 'PATCH', body: JSON.stringify({ name: 'Updated' }),
    }), malformedContext)],
    ['done', () => completeReminder(new Request('http://localhost/api/reminders/not-a-uuid/done', { method: 'POST' }), malformedContext)],
    ['renew', () => renewReminder(new Request('http://localhost/api/reminders/not-a-uuid/renew', {
      method: 'POST', body: JSON.stringify({ name: 'Next', endDate: '2027-01-01', leadDays: 7, alertTime: '09:00' }),
    }), malformedContext)],
  ])('returns 400 before persistence for a malformed %s identifier', async (_name, request) => {
    const detail = vi.spyOn(ReminderService.prototype, 'getReminderWithHistory');
    const update = vi.spyOn(ReminderService.prototype, 'updateReminder');
    const complete = vi.spyOn(ReminderService.prototype, 'completeReminder');
    const renew = vi.spyOn(ReminderService.prototype, 'renewReminder');

    const response = await request();

    expect(response.status).toBe(400);
    expect(detail).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    expect(renew).not.toHaveBeenCalled();
  });
});

it('does not create a reminder when presentation settings cannot be loaded', async () => {
  vi.spyOn(SettingsRepository.prototype, 'getSingleton').mockRejectedValueOnce(new Error('settings unavailable'));
  const create = vi.spyOn(ReminderService.prototype, 'createReminder');
  const response = await createReminder(new Request('http://localhost/api/reminders', {
    method: 'POST',
    body: JSON.stringify({ name: 'Passport', endDate: '2027-01-01', leadDays: 7, alertTime: '09:00' }),
  }));

  expect(response.status).toBe(500);
  expect(create).not.toHaveBeenCalled();
});

it('maps a persistence uniqueness conflict to 409 without exposing database details', async () => {
  const response = reminderRouteError(new Prisma.PrismaClientKnownRequestError('duplicate detail', {
    code: 'P2002',
    clientVersion: '7.9.1',
  }));

  expect(response.status).toBe(409);
  await expect(response.json()).resolves.toEqual({ error: 'Reminder conflict' });
});
