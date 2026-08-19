import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/server/db/client';
import { NotificationRepository } from '@/server/notifications/repository';
import { ReminderService } from '@/server/reminders/service';
import { SettingsRepository, SETTINGS_SINGLETON_ID } from '@/server/settings/repository';
import { SettingsService } from '@/server/settings/service';

const NOW = new Date('2026-08-19T12:00:00.000Z');
const reminderService = new ReminderService();
const settingsService = new SettingsService();
const fixtureNames: string[] = [];
let originalSettings: {
  notificationEmail: string;
  timezone: string;
  defaultAlertTime: string;
} | null = null;

beforeEach(async () => {
  originalSettings = await prisma.settings.findUnique({
    where: { id: SETTINGS_SINGLETON_ID },
    select: { notificationEmail: true, timezone: true, defaultAlertTime: true },
  });
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
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (fixtureNames.length > 0) {
    await prisma.reminder.deleteMany({ where: { name: { in: fixtureNames } } });
    fixtureNames.length = 0;
  }
  if (originalSettings) {
    await prisma.settings.update({ where: { id: SETTINGS_SINGLETON_ID }, data: originalSettings });
  } else {
    await prisma.settings.deleteMany({ where: { id: SETTINGS_SINGLETON_ID } });
  }
  originalSettings = null;
});

async function createActiveReminder(name: string) {
  fixtureNames.push(name);
  return reminderService.createReminder({
    name,
    endDate: '2026-12-01',
    leadDays: 14,
    alertTime: '09:00',
  }, NOW);
}

describe('SettingsService timezone rescheduling', () => {
  it('recalculates active pending schedules and preserves sent history', async () => {
    const active = await createActiveReminder(`Settings active ${crypto.randomUUID()}`);
    const sent = await createActiveReminder(`Settings sent ${crypto.randomUUID()}`);
    await prisma.notification.update({
      where: { id: sent.notification.id },
      data: { status: 'SENT', sentAt: NOW, attemptCount: 1 },
    });

    const result = await settingsService.updateSettings({ timezone: 'Europe/London' });
    const pendingRows = await prisma.notification.findMany({
      where: { reminderId: active.reminder.id },
      orderBy: { createdAt: 'asc' },
    });
    const updatedActive = await prisma.reminder.findUniqueOrThrow({ where: { id: active.reminder.id } });
    const unchangedSent = await prisma.reminder.findUniqueOrThrow({ where: { id: sent.reminder.id } });

    expect(result.timezone).toBe('Europe/London');
    expect(pendingRows.map((row) => row.status)).toEqual(['CANCELLED', 'PENDING']);
    expect(pendingRows[1]?.scheduledFor.toISOString()).toBe('2026-11-17T09:00:00.000Z');
    expect(updatedActive.alertAt).toEqual(pendingRows[1]?.scheduledFor);
    expect(unchangedSent.alertAt).toEqual(sent.reminder.alertAt);
    expect(await prisma.notification.count({
      where: { reminderId: sent.reminder.id, status: 'SENT' },
    })).toBe(1);
  });

  it('rolls back settings, reminder, and notification changes when replacement creation fails', async () => {
    const active = await createActiveReminder(`Settings rollback ${crypto.randomUUID()}`);
    vi.spyOn(NotificationRepository.prototype, 'createPending').mockRejectedValueOnce(new Error('insert failed'));

    await expect(settingsService.updateSettings({ timezone: 'Europe/London' })).rejects.toThrow('insert failed');

    expect(await new SettingsRepository(prisma).getSingleton()).toMatchObject({ timezone: 'Africa/Casablanca' });
    expect(await prisma.reminder.findUnique({ where: { id: active.reminder.id } }))
      .toMatchObject({ alertAt: active.reminder.alertAt });
    expect(await prisma.notification.findMany({ where: { reminderId: active.reminder.id } }))
      .toMatchObject([{ id: active.notification.id, status: 'PENDING' }]);
  });
});
