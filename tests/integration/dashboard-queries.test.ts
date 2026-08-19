import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '@/server/db/client';
import { getDashboardData } from '@/server/dashboard/queries';
import { SETTINGS_SINGLETON_ID } from '@/server/settings/repository';

const NOW = new Date('2026-08-19T12:00:00.000Z');

async function seedReminder(input: {
  name: string;
  endDate: string;
  status?: 'ACTIVE' | 'DONE' | 'ARCHIVED';
  completedAt?: string;
  parentReminderId?: string;
  createdAt?: string;
}) {
  return prisma.reminder.create({
    data: {
      name: input.name,
      endDate: new Date(`${input.endDate}T00:00:00.000Z`),
      alertLeadDays: 7,
      alertTime: '09:00',
      alertAt: new Date(`${input.endDate}T08:00:00.000Z`),
      status: input.status ?? 'ACTIVE',
      completedAt: input.completedAt ? new Date(input.completedAt) : null,
      parentReminderId: input.parentReminderId,
      createdAt: input.createdAt ? new Date(input.createdAt) : undefined,
    },
  });
}

async function seedSentNotification(reminderId: string, sentAt: string) {
  return prisma.notification.create({
    data: {
      reminderId,
      scheduledFor: new Date(sentAt),
      status: 'SENT',
      sentAt: new Date(sentAt),
      attemptCount: 1,
      idempotencyKey: crypto.randomUUID(),
    },
  });
}

beforeEach(async () => {
  await prisma.notification.deleteMany();
  await prisma.reminder.deleteMany();
  await prisma.settings.upsert({
    where: { id: SETTINGS_SINGLETON_ID },
    create: {
      id: SETTINGS_SINGLETON_ID,
      notificationEmail: 'owner@example.com',
      timezone: 'Africa/Casablanca',
      defaultAlertTime: '09:00',
    },
    update: {
      timezone: 'Africa/Casablanca',
    },
  });
});

afterAll(async () => {
  await prisma.notification.deleteMany();
  await prisma.reminder.deleteMany();
});

describe('getDashboardData', () => {
  it('counts due-in-seven-days without counting overdue reminders', async () => {
    await seedReminder({ name: 'Overdue hosting', endDate: '2026-08-18' });
    await seedReminder({ name: 'Passport renewal', endDate: '2026-08-22' });
    await seedReminder({ name: 'Domain renewal', endDate: '2026-09-03' });

    const data = await getDashboardData(NOW);

    expect(data.summary).toMatchObject({
      activeReminders: 3,
      overdue: 1,
      dueInSevenDays: 1,
    });
    expect(data.urgencyCounts).toEqual({ OVERDUE: 1, URGENT: 1, SOON: 0, SAFE: 1 });
  });

  it('counts sent emails by the owner local calendar month', async () => {
    const reminder = await seedReminder({ name: 'Email boundary', endDate: '2026-09-03' });
    await seedSentNotification(reminder.id, '2026-08-01T00:30:00.000Z');
    await seedSentNotification(reminder.id, '2026-07-31T22:30:00.000Z');

    const data = await getDashboardData(NOW);

    expect(data.summary.sentThisMonth).toBe(1);
  });

  it('returns compact attention, six-month outcome, and thirty-day timeline data', async () => {
    const overdue = await seedReminder({ name: 'Hosting plan', endDate: '2026-08-17' });
    await seedReminder({ name: 'Passport renewal', endDate: '2026-08-21' });
    await seedReminder({ name: 'Car insurance', endDate: '2026-08-25' });
    await seedReminder({ name: 'Outside the rail', endDate: '2026-09-20' });
    const completed = await seedReminder({
      name: 'Completed July',
      endDate: '2026-07-12',
      status: 'DONE',
      completedAt: '2026-07-31T23:30:00.000Z',
    });
    expect(completed).toMatchObject({ status: 'DONE', completedAt: new Date('2026-07-31T23:30:00.000Z') });
    await seedReminder({
      name: 'Renewed August',
      endDate: '2026-09-15',
      status: 'ARCHIVED',
      parentReminderId: overdue.id,
      createdAt: '2026-08-02T10:00:00.000Z',
    });

    const data = await getDashboardData(NOW);

    expect(data.attention.map(({ name, urgency }) => [name, urgency])).toEqual([
      ['Hosting plan', 'OVERDUE'],
      ['Passport renewal', 'URGENT'],
    ]);
    expect(data.nextThirtyDays.map(({ name }) => name)).toEqual([
      'Hosting plan',
      'Passport renewal',
      'Car insurance',
    ]);
    expect(data.completedVsRenewed).toHaveLength(6);
    expect(data.completedVsRenewed.at(-1)).toMatchObject({
      monthKey: '2026-08',
      completed: 1,
      renewed: 1,
    });
    expect(data).not.toHaveProperty('reminders');
  });
});
