import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db/client';
import { NotificationRepository } from '@/server/notifications/repository';
import { ReminderRepository } from '@/server/reminders/repository';
import { SETTINGS_SINGLETON_ID, SettingsRepository } from '@/server/settings/repository';

const testNames: string[] = [];
let originalSettings: {
  notificationEmail: string;
  timezone: string;
  defaultAlertTime: string;
} | null = null;

beforeEach(async () => {
  originalSettings = await prisma.settings.findUnique({
    where: { id: SETTINGS_SINGLETON_ID },
    select: {
      notificationEmail: true,
      timezone: true,
      defaultAlertTime: true,
    },
  });
});

afterEach(async () => {
  if (testNames.length > 0) {
    await prisma.reminder.deleteMany({ where: { name: { in: testNames } } });
    testNames.length = 0;
  }

  if (originalSettings) {
    await prisma.settings.update({
      where: { id: SETTINGS_SINGLETON_ID },
      data: originalSettings,
    });
  } else {
    await prisma.settings.deleteMany({ where: { id: SETTINGS_SINGLETON_ID } });
  }
  originalSettings = null;
});

function makeReminderInput(name: string) {
  return {
    name,
    endDate: new Date('2026-09-01'),
    alertLeadDays: 3,
    alertTime: '09:00',
    alertAt: new Date('2026-08-29T08:00:00.000Z'),
  };
}

describe('ReminderRepository', () => {
  it('creates, updates, lists active, and changes a reminder status', async () => {
    const name = `Repository reminder ${crypto.randomUUID()}`;
    testNames.push(name);
    const reminders = new ReminderRepository(prisma);

    const created = await reminders.create(makeReminderInput(name));
    await reminders.update(created.id, { name: `${name} updated`, alertLeadDays: 5 });
    testNames.push(`${name} updated`);

    expect((await reminders.listActive()).filter((reminder) => reminder.id === created.id))
      .toMatchObject([{ id: created.id, status: 'ACTIVE' }]);
    await reminders.setStatus(created.id, 'DONE', new Date('2026-08-30T08:00:00.000Z'));

    expect(await reminders.findById(created.id)).toMatchObject({
      id: created.id,
      name: `${name} updated`,
      alertLeadDays: 5,
      status: 'DONE',
      completedAt: new Date('2026-08-30T08:00:00.000Z'),
    });
    expect((await reminders.listActive()).filter((reminder) => reminder.id === created.id)).toEqual([]);
  });
});

describe('NotificationRepository', () => {
  it('claims an eligible notification and records its send result', async () => {
    const name = `Notification reminder ${crypto.randomUUID()}`;
    testNames.push(name);
    const reminders = new ReminderRepository(prisma);
    const notifications = new NotificationRepository(prisma);
    const reminder = await reminders.create(makeReminderInput(name));
    const scheduledFor = new Date('2026-08-29T08:00:00.000Z');
    const pending = await notifications.createPending({
      reminderId: reminder.id,
      scheduledFor,
      idempotencyKey: crypto.randomUUID(),
      channel: 'EMAIL',
      status: 'PENDING',
    });

    expect(await notifications.findDueCandidates({
      now: new Date('2026-08-29T08:01:00.000Z'),
      scheduledForStatuses: ['PENDING'],
      nextAttemptStatuses: ['FAILED'],
      limit: 10,
    }))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ id: pending.id, status: 'PENDING' }),
      ]));
    expect(await notifications.claimPending({
      id: pending.id,
      expectedStatuses: ['PENDING', 'FAILED'],
      status: 'PROCESSING',
      processingStartedAt: new Date('2026-08-29T08:01:00.000Z'),
      incrementAttemptCount: true,
    }))
      .toMatchObject({ id: pending.id, status: 'PROCESSING', attemptCount: 1 });

    await notifications.markSent(pending.id, {
      status: 'SENT',
      providerMessageId: 'provider-message-123',
      sentAt: new Date('2026-08-29T08:02:00.000Z'),
      nextAttemptAt: null,
      processingStartedAt: null,
      lastError: null,
    });
    expect(await prisma.notification.findUnique({ where: { id: pending.id } })).toMatchObject({
      status: 'SENT',
      providerMessageId: 'provider-message-123',
      sentAt: new Date('2026-08-29T08:02:00.000Z'),
    });
  });

  it('cancels pending notifications and reclaims expired processing leases', async () => {
    const name = `Lease reminder ${crypto.randomUUID()}`;
    testNames.push(name);
    const reminders = new ReminderRepository(prisma);
    const notifications = new NotificationRepository(prisma);
    const reminder = await reminders.create(makeReminderInput(name));
    const pending = await notifications.createPending({
      reminderId: reminder.id,
      scheduledFor: new Date('2026-08-29T08:00:00.000Z'),
      idempotencyKey: crypto.randomUUID(),
      channel: 'EMAIL',
      status: 'PENDING',
    });

    await notifications.claimPending({
      id: pending.id,
      expectedStatuses: ['PENDING'],
      status: 'PROCESSING',
      processingStartedAt: new Date('2026-08-29T08:01:00.000Z'),
      incrementAttemptCount: true,
    });
    expect(await notifications.reclaimExpiredProcessing({
      leaseExpiredBefore: new Date('2026-08-29T08:02:00.000Z'),
      expectedStatus: 'PROCESSING',
      status: 'PENDING',
      processingStartedAt: null,
      incrementAttemptCount: true,
    }))
      .toBe(1);
    expect(await prisma.notification.findUnique({ where: { id: pending.id } })).toMatchObject({
      status: 'PENDING',
      attemptCount: 2,
      processingStartedAt: null,
    });

    expect(await notifications.cancelPendingForReminder(reminder.id, {
      expectedStatus: 'PENDING',
      status: 'CANCELLED',
    })).toBe(1);
    expect(await prisma.notification.findUnique({ where: { id: pending.id } })).toMatchObject({
      status: 'CANCELLED',
    });
  });

  it('records failed delivery details without changing the idempotency key', async () => {
    const name = `Failure reminder ${crypto.randomUUID()}`;
    testNames.push(name);
    const reminders = new ReminderRepository(prisma);
    const notifications = new NotificationRepository(prisma);
    const reminder = await reminders.create(makeReminderInput(name));
    const idempotencyKey = crypto.randomUUID();
    const pending = await notifications.createPending({
      reminderId: reminder.id,
      scheduledFor: new Date('2026-08-29T08:00:00.000Z'),
      idempotencyKey,
      channel: 'EMAIL',
      status: 'PENDING',
    });

    await notifications.claimPending({
      id: pending.id,
      expectedStatuses: ['PENDING'],
      status: 'PROCESSING',
      processingStartedAt: new Date('2026-08-29T08:01:00.000Z'),
      incrementAttemptCount: true,
    });
    await notifications.markFailed(pending.id, {
      status: 'FAILED',
      lastError: 'The provider timed out',
      nextAttemptAt: new Date('2026-08-29T08:06:00.000Z'),
      processingStartedAt: null,
    });

    expect(await prisma.notification.findUnique({ where: { id: pending.id } })).toMatchObject({
      status: 'FAILED',
      idempotencyKey,
      lastError: 'The provider timed out',
      nextAttemptAt: new Date('2026-08-29T08:06:00.000Z'),
      processingStartedAt: null,
    });
  });
});

describe('SettingsRepository', () => {
  it('returns and updates the singleton owner settings', async () => {
    const settings = new SettingsRepository(prisma);
    await prisma.settings.upsert({
      where: { id: SETTINGS_SINGLETON_ID },
      create: {
        id: SETTINGS_SINGLETON_ID,
        notificationEmail: 'owner@example.com',
        timezone: 'Africa/Casablanca',
        defaultAlertTime: '09:00',
      },
      update: {
        notificationEmail: 'owner@example.com',
        timezone: 'Africa/Casablanca',
        defaultAlertTime: '09:00',
      },
    });

    expect(await settings.getSingleton()).toMatchObject({
      notificationEmail: 'owner@example.com',
      timezone: 'Africa/Casablanca',
      defaultAlertTime: '09:00',
    });
    expect(await settings.updateSingleton({
      notificationEmail: 'next-owner@example.com',
      timezone: 'Europe/London',
      defaultAlertTime: '10:30',
    })).toMatchObject({
      notificationEmail: 'next-owner@example.com',
      timezone: 'Europe/London',
      defaultAlertTime: '10:30',
    });
  });
});
