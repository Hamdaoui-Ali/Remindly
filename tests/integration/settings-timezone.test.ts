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

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => { resolve = next; });
  return { promise, resolve };
}

async function lockSettingsRow() {
  const locked = deferred();
  const release = deferred();
  const finished = prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM settings WHERE id = ${SETTINGS_SINGLETON_ID} FOR UPDATE`;
    locked.resolve();
    await release.promise;
  });
  await locked.promise;
  return { release, finished };
}

async function waitForBlockedSettingsLocks(count: number) {
  await expect.poll(async () => {
    const rows = await prisma.$queryRaw<Array<{ waiting: bigint }>>`
      SELECT count(*)::bigint AS waiting
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND wait_event_type = 'Lock'
        AND query ILIKE ${'%settings%'}
    `;
    return Number(rows[0]?.waiting ?? 0n);
  }, { timeout: 5_000, interval: 20 }).toBeGreaterThanOrEqual(count);
}

describe('SettingsService timezone rescheduling', () => {
  it('recalculates active pending schedules and preserves sent history', async () => {
    const active = await createActiveReminder(`Settings active ${crypto.randomUUID()}`);
    const sent = await createActiveReminder(`Settings sent ${crypto.randomUUID()}`);
    const [failed, processing] = await Promise.all([
      prisma.notification.create({
        data: {
          reminderId: active.reminder.id,
          scheduledFor: new Date(active.reminder.alertAt.getTime() - 120_000),
          channel: 'EMAIL',
          status: 'FAILED',
          attemptCount: 2,
          idempotencyKey: crypto.randomUUID(),
          lastError: 'Provider unavailable',
        },
      }),
      prisma.notification.create({
        data: {
          reminderId: active.reminder.id,
          scheduledFor: new Date(active.reminder.alertAt.getTime() - 60_000),
          channel: 'EMAIL',
          status: 'PROCESSING',
          attemptCount: 1,
          processingStartedAt: NOW,
          idempotencyKey: crypto.randomUUID(),
        },
      }),
    ]);
    await prisma.notification.update({
      where: { id: sent.notification.id },
      data: { status: 'SENT', sentAt: NOW, attemptCount: 1 },
    });

    const result = await settingsService.updateSettings({ timezone: 'Europe/London' });
    const pendingRows = await prisma.notification.findMany({
      where: { reminderId: active.reminder.id },
      orderBy: { createdAt: 'asc' },
    });
    const replacementRows = pendingRows.filter(({ status }) => status === 'CANCELLED' || status === 'PENDING');
    const updatedActive = await prisma.reminder.findUniqueOrThrow({ where: { id: active.reminder.id } });
    const unchangedSent = await prisma.reminder.findUniqueOrThrow({ where: { id: sent.reminder.id } });

    expect(result.timezone).toBe('Europe/London');
    expect(replacementRows.map((row) => row.status)).toEqual(['CANCELLED', 'PENDING']);
    expect(replacementRows[1]?.scheduledFor.toISOString()).toBe('2026-11-17T09:00:00.000Z');
    expect(updatedActive.alertAt).toEqual(replacementRows[1]?.scheduledFor);
    expect(unchangedSent.alertAt).toEqual(sent.reminder.alertAt);
    expect(await prisma.notification.count({
      where: { reminderId: sent.reminder.id, status: 'SENT' },
    })).toBe(1);
    expect(await prisma.notification.findUnique({ where: { id: failed.id } })).toMatchObject({
      status: 'FAILED',
      scheduledFor: failed.scheduledFor,
      attemptCount: 2,
      lastError: 'Provider unavailable',
    });
    expect(await prisma.notification.findUnique({ where: { id: processing.id } })).toMatchObject({
      status: 'PROCESSING',
      scheduledFor: processing.scheduledFor,
      attemptCount: 1,
      processingStartedAt: NOW,
    });
  });

  it('serializes concurrent timezone and email updates before deriving replacement schedules', async () => {
    const active = await createActiveReminder(`Settings concurrent ${crypto.randomUUID()}`);
    const lock = await lockSettingsRow();
    const timezoneUpdate = settingsService.updateSettings({ timezone: 'Europe/London' });
    await waitForBlockedSettingsLocks(1);
    const emailUpdate = settingsService.updateSettings({ notificationEmail: 'alerts@example.com' });
    await waitForBlockedSettingsLocks(2);
    lock.release.resolve();
    await lock.finished;

    await expect(Promise.all([timezoneUpdate, emailUpdate])).resolves.toEqual([
      expect.objectContaining({ timezone: 'Europe/London' }),
      expect.objectContaining({ notificationEmail: 'alerts@example.com', timezone: 'Europe/London' }),
    ]);

    const stored = await new SettingsRepository(prisma).getSingleton();
    const updatedReminder = await prisma.reminder.findUniqueOrThrow({ where: { id: active.reminder.id } });
    const pending = await prisma.notification.findMany({
      where: { reminderId: active.reminder.id, status: 'PENDING' },
    });
    expect(stored).toMatchObject({
      notificationEmail: 'alerts@example.com',
      timezone: 'Europe/London',
    });
    expect(updatedReminder.alertAt.toISOString()).toBe('2026-11-17T09:00:00.000Z');
    expect(pending).toHaveLength(1);
    expect(pending[0]?.scheduledFor).toEqual(updatedReminder.alertAt);
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
