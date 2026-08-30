import { afterEach, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db/client';

const createdReminderIds: string[] = [];
const createdProfileIds: string[] = [];
const createdAttemptIds: string[] = [];
const createdRunIds: string[] = [];

afterEach(async () => {
  if (createdReminderIds.length > 0) {
    await prisma.reminder.deleteMany({ where: { id: { in: createdReminderIds } } });
  }
  if (createdProfileIds.length > 0) {
    await prisma.userProfile.deleteMany({ where: { id: { in: createdProfileIds } } });
  }
  if (createdAttemptIds.length > 0) {
    await prisma.emailSendAttempt.deleteMany({ where: { id: { in: createdAttemptIds } } });
  }
  if (createdRunIds.length > 0) {
    await prisma.processorRun.deleteMany({ where: { id: { in: createdRunIds } } });
  }

  createdReminderIds.length = 0;
  createdProfileIds.length = 0;
  createdAttemptIds.length = 0;
  createdRunIds.length = 0;
});

describe('Supabase refactor schema', () => {
  it('supports a profile-owned reminder with versioned alerts and notifications', async () => {
    const profileId = crypto.randomUUID();
    createdProfileIds.push(profileId);
    const profile = await prisma.userProfile.create({
      data: {
        id: profileId,
        email: `schema-${profileId}@example.com`,
        timezone: 'Africa/Casablanca',
        defaultAlertTime: '09:00',
      },
    });

    const reminder = await prisma.reminder.create({
      data: {
        name: `Refactor schema ${profileId}`,
        userId: profile.id,
        endDate: new Date('2026-09-01'),
        alertLeadDays: 3,
        alertTime: '09:00',
        alertAt: new Date('2026-08-29T08:00:00.000Z'),
        status: 'ACTIVE',
      },
    });
    createdReminderIds.push(reminder.id);

    const scheduledFor = new Date('2026-08-29T08:00:00.000Z');
    const alert = await prisma.reminderAlert.create({
      data: {
        reminderId: reminder.id,
        scheduledFor,
        offsetMinutes: 4320,
        scheduleVersion: 2,
        channel: 'EMAIL',
        enabled: true,
      },
    });

    const notification = await prisma.notification.create({
      data: {
        reminderAlertId: alert.id,
        scheduleVersion: alert.scheduleVersion,
        reminderId: reminder.id,
        scheduledFor,
        channel: 'EMAIL',
        idempotencyKey: crypto.randomUUID(),
        status: 'PENDING',
      },
    });

    expect(notification.reminderAlertId).toBe(alert.id);
    expect(notification.scheduleVersion).toBe(2);
  });

  it('enforces profile email and alert schedule uniqueness', async () => {
    const profileId = crypto.randomUUID();
    createdProfileIds.push(profileId);
    const email = `unique-${profileId}@example.com`;
    await prisma.userProfile.create({
      data: {
        id: profileId,
        email,
        timezone: 'UTC',
        defaultAlertTime: '09:00',
      },
    });

    await expect(prisma.userProfile.create({
      data: {
        id: crypto.randomUUID(),
        email,
        timezone: 'UTC',
        defaultAlertTime: '09:00',
      },
    })).rejects.toThrow();

    const reminder = await prisma.reminder.create({
      data: {
        name: `Unique alert ${profileId}`,
        userId: profileId,
        endDate: new Date('2026-09-01'),
        alertLeadDays: 3,
        alertTime: '09:00',
        alertAt: new Date('2026-08-29T08:00:00.000Z'),
        status: 'ACTIVE',
      },
    });
    createdReminderIds.push(reminder.id);

    const alertData = {
      reminderId: reminder.id,
      scheduledFor: new Date('2026-08-29T08:00:00.000Z'),
      offsetMinutes: 4320,
      scheduleVersion: 1,
      channel: 'EMAIL' as const,
    };
    await prisma.reminderAlert.create({ data: alertData });
    await expect(prisma.reminderAlert.create({ data: alertData })).rejects.toThrow();
  });

  it('stores sanitized operational email and processor records', async () => {
    const attempt = await prisma.emailSendAttempt.create({
      data: {
        purpose: 'AUTH',
        outcome: 'RESERVED',
        sanitizedCode: 'provider_timeout',
      },
    });
    createdAttemptIds.push(attempt.id);

    const run = await prisma.processorRun.create({
      data: {
        status: 'RUNNING',
        claimed: 1,
      },
    });
    createdRunIds.push(run.id);

    expect(attempt.outcome).toBe('RESERVED');
    expect(run.status).toBe('RUNNING');
  });
});
