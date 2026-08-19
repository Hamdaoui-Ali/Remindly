import { afterEach, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db/client';

const testNames: string[] = [];

afterEach(async () => {
  if (testNames.length === 0) return;

  await prisma.reminder.deleteMany({ where: { name: { in: testNames } } });
  testNames.length = 0;
});

describe('database schema', () => {
  it('enforces one notification channel and schedule per reminder cycle', async () => {
    const name = `Schema check ${crypto.randomUUID()}`;
    testNames.push(name);
    const reminder = await prisma.reminder.create({
      data: {
        name,
        endDate: new Date('2026-09-01'),
        alertLeadDays: 3,
        alertTime: '09:00',
        alertAt: new Date('2026-08-29T08:00:00.000Z'),
        status: 'ACTIVE',
      },
    });

    await prisma.notification.create({
      data: {
        reminderId: reminder.id,
        scheduledFor: reminder.alertAt,
        channel: 'EMAIL',
        idempotencyKey: crypto.randomUUID(),
        status: 'PENDING',
      },
    });

    await expect(prisma.notification.create({
      data: {
        reminderId: reminder.id,
        scheduledFor: reminder.alertAt,
        channel: 'EMAIL',
        idempotencyKey: crypto.randomUUID(),
        status: 'PENDING',
      },
    })).rejects.toThrow();
  });
});
