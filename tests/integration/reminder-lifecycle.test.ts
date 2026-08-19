import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/server/db/client';
import { ReminderService } from '@/server/reminders/service';
import { NotificationRepository } from '@/server/notifications/repository';
import { SETTINGS_SINGLETON_ID } from '@/server/settings/repository';

const NOW = new Date('2026-08-19T12:00:00.000Z');
const service = new ReminderService();
const fixtureNames: string[] = [];
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
    await prisma.settings.update({
      where: { id: SETTINGS_SINGLETON_ID },
      data: originalSettings,
    });
  } else {
    await prisma.settings.deleteMany({ where: { id: SETTINGS_SINGLETON_ID } });
  }
  originalSettings = null;
});

function input(name: string, overrides: Partial<{
  endDate: string;
  leadDays: 0 | 1 | 3 | 7 | 14 | 30;
  alertTime: string;
  timezone: string;
}> = {}) {
  fixtureNames.push(name);
  return {
    name,
    endDate: '2026-12-01',
    leadDays: 14 as const,
    alertTime: '09:00',
    timezone: 'Africa/Casablanca',
    ...overrides,
  };
}

async function createFixture(overrides: Parameters<typeof input>[1] = {}) {
  return service.createReminder(input(`Lifecycle reminder ${crypto.randomUUID()}`, overrides), NOW);
}

async function createHistoricalNotifications(reminderId: string, scheduledFor: Date) {
  return Promise.all([
    prisma.notification.create({
      data: {
        reminderId,
        scheduledFor: new Date(scheduledFor.getTime() - 120_000),
        channel: 'EMAIL',
        status: 'FAILED',
        idempotencyKey: crypto.randomUUID(),
        lastError: 'Provider timed out',
      },
    }),
    prisma.notification.create({
      data: {
        reminderId,
        scheduledFor: new Date(scheduledFor.getTime() - 180_000),
        channel: 'EMAIL',
        status: 'PROCESSING',
        idempotencyKey: crypto.randomUUID(),
        processingStartedAt: NOW,
      },
    }),
  ]);
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => { resolve = next; });
  return { promise, resolve };
}

async function lockReminderRow(id: string) {
  const locked = deferred();
  const release = deferred();
  const finished = prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM reminders WHERE id = ${id}::uuid FOR UPDATE`;
    locked.resolve();
    await release.promise;
  });
  await locked.promise;
  return { release, finished };
}

async function waitForBlockedReminderUpdates(count: number) {
  await expect.poll(async () => {
    const rows = await prisma.$queryRaw<Array<{ waiting: bigint }>>`
      SELECT count(*)::bigint AS waiting
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND wait_event_type = 'Lock'
        AND query LIKE ${'%UPDATE%reminders%'}
    `;
    return Number(rows[0]?.waiting ?? 0n);
  }, { timeout: 5_000, interval: 20 }).toBeGreaterThanOrEqual(count);
}

describe('ReminderService lifecycle', () => {
  it('creates one active reminder and one pending notification atomically', async () => {
    const cycle = await createFixture();

    expect(cycle.reminder.status).toBe('ACTIVE');
    expect(cycle.notification).toMatchObject({
      reminderId: cycle.reminder.id,
      status: 'PENDING',
      channel: 'EMAIL',
    });
    expect(cycle.notification.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(cycle.notification.idempotencyKey).toBe(cycle.notification.id);
    expect(await prisma.notification.count({ where: { reminderId: cycle.reminder.id } })).toBe(1);
  });

  it('uses the configured timezone when calculating the pending email time', async () => {
    const cycle = await createFixture({
      endDate: '2026-03-23',
      leadDays: 1,
      alertTime: '09:30',
      timezone: 'UTC',
    });

    expect(cycle.reminder.alertAt.toISOString()).toBe('2026-03-22T08:30:00.000Z');
    expect(cycle.notification.scheduledFor).toEqual(cycle.reminder.alertAt);
  });

  it('preserves the existing pending notification for a name-only edit', async () => {
    const cycle = await createFixture();
    const updatedName = `${cycle.reminder.name} renamed`;
    fixtureNames.push(updatedName);

    await service.updateReminder(cycle.reminder.id, { name: updatedName }, NOW);
    const rows = await prisma.notification.findMany({ where: { reminderId: cycle.reminder.id } });

    expect(rows).toMatchObject([{ id: cycle.notification.id, status: 'PENDING' }]);
  });

  it('replaces only the pending row when a schedule changes', async () => {
    const cycle = await createFixture();
    const [failed, processing] = await createHistoricalNotifications(
      cycle.reminder.id,
      cycle.notification.scheduledFor,
    );

    await service.updateReminder(cycle.reminder.id, { endDate: '2027-01-01' }, NOW);
    const rows = await prisma.notification.findMany({
      where: { reminderId: cycle.reminder.id },
      orderBy: { createdAt: 'asc' },
    });

    const lifecycleRows = rows.filter((row) => row.status === 'CANCELLED' || row.status === 'PENDING');
    expect(lifecycleRows.map((row) => row.status)).toEqual(['CANCELLED', 'PENDING']);
    expect(lifecycleRows[1]?.scheduledFor.getTime()).not.toBe(lifecycleRows[0]?.scheduledFor.getTime());
    expect(await prisma.notification.findUnique({ where: { id: failed.id } })).toMatchObject({ status: 'FAILED' });
    expect(await prisma.notification.findUnique({ where: { id: processing.id } })).toMatchObject({ status: 'PROCESSING' });
  });

  it('allows a past reminder date and creates its pending email', async () => {
    const cycle = await createFixture({ endDate: '2026-01-01', leadDays: 0 });

    expect(cycle.reminder.status).toBe('ACTIVE');
    expect(cycle.notification.status).toBe('PENDING');
  });

  it('completes an active reminder and cancels pending notifications only', async () => {
    const cycle = await createFixture();
    const historical = await prisma.notification.create({
      data: {
        reminderId: cycle.reminder.id,
        scheduledFor: new Date(cycle.notification.scheduledFor.getTime() - 60_000),
        channel: 'EMAIL',
        status: 'SENT',
        idempotencyKey: crypto.randomUUID(),
        sentAt: NOW,
      },
    });
    const [failed, processing] = await createHistoricalNotifications(
      cycle.reminder.id,
      cycle.notification.scheduledFor,
    );

    const completed = await service.completeReminder(cycle.reminder.id, NOW);

    expect(completed).toMatchObject({ status: 'DONE', completedAt: NOW });
    expect(await prisma.notification.findUnique({ where: { id: cycle.notification.id } }))
      .toMatchObject({ status: 'CANCELLED' });
    expect(await prisma.notification.findUnique({ where: { id: historical.id } }))
      .toMatchObject({ status: 'SENT' });
    expect(await prisma.notification.findUnique({ where: { id: failed.id } })).toMatchObject({ status: 'FAILED' });
    expect(await prisma.notification.findUnique({ where: { id: processing.id } })).toMatchObject({ status: 'PROCESSING' });
  });

  it('archives an active source and creates a linked child cycle', async () => {
    const source = await createFixture();
    const [failed, processing] = await createHistoricalNotifications(
      source.reminder.id,
      source.notification.scheduledFor,
    );
    const childName = `Renewed reminder ${crypto.randomUUID()}`;
    fixtureNames.push(childName);

    const cycle = await service.renewReminder(source.reminder.id, input(childName), NOW);

    expect(await prisma.reminder.findUnique({ where: { id: source.reminder.id } }))
      .toMatchObject({ status: 'ARCHIVED' });
    expect(await prisma.notification.findUnique({ where: { id: source.notification.id } }))
      .toMatchObject({ status: 'CANCELLED' });
    expect(await prisma.notification.findUnique({ where: { id: failed.id } })).toMatchObject({ status: 'FAILED' });
    expect(await prisma.notification.findUnique({ where: { id: processing.id } })).toMatchObject({ status: 'PROCESSING' });
    expect(cycle.reminder).toMatchObject({ status: 'ACTIVE', parentReminderId: source.reminder.id });
    expect(cycle.notification).toMatchObject({ reminderId: cycle.reminder.id, status: 'PENDING' });
  });

  it('archives a done source and creates a linked child cycle', async () => {
    const source = await createFixture();
    await service.completeReminder(source.reminder.id, NOW);
    const childName = `Done renewal ${crypto.randomUUID()}`;
    fixtureNames.push(childName);

    const cycle = await service.renewReminder(source.reminder.id, input(childName), NOW);

    expect(await prisma.reminder.findUnique({ where: { id: source.reminder.id } }))
      .toMatchObject({ status: 'ARCHIVED' });
    expect(cycle.reminder.parentReminderId).toBe(source.reminder.id);
  });

  it('rejects editing, completing, and renewing an archived reminder', async () => {
    const source = await createFixture();
    const childName = `Archived rejection renewal ${crypto.randomUUID()}`;
    fixtureNames.push(childName);
    await service.renewReminder(source.reminder.id, input(childName), NOW);

    await expect(service.updateReminder(source.reminder.id, { name: 'No edit' }, NOW)).rejects.toThrow('archived');
    await expect(service.completeReminder(source.reminder.id, NOW)).rejects.toThrow('archived');
    await expect(service.renewReminder(source.reminder.id, input(`No renewal ${crypto.randomUUID()}`), NOW))
      .rejects.toThrow('archived');
  });

  it('rolls back reminder creation when pending notification insertion fails', async () => {
    const existing = await createFixture();
    const failedName = `Failed creation ${crypto.randomUUID()}`;
    fixtureNames.push(failedName);
    const createPending = NotificationRepository.prototype.createPending;
    vi.spyOn(NotificationRepository.prototype, 'createPending').mockImplementationOnce(function (
      this: NotificationRepository,
      input,
    ) {
      return createPending.call(this, {
        ...input,
        id: existing.notification.id,
        idempotencyKey: existing.notification.idempotencyKey,
      });
    });

    await expect(service.createReminder(input(failedName), NOW)).rejects.toThrow();

    expect(await prisma.reminder.count({ where: { name: failedName } })).toBe(0);
  });

  it('lists active reminders with configured-calendar urgency and email display data', async () => {
    const cycle = await createFixture({ endDate: '2026-08-21', leadDays: 1 });

    const items = await service.listActiveReminders(NOW);

    expect(items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        reminder: expect.objectContaining({ id: cycle.reminder.id }),
        urgency: 'URGENT',
        remainingCalendarDays: 2,
        scheduledEmail: expect.objectContaining({ id: cycle.notification.id, status: 'PENDING' }),
      }),
    ]));
  });

  it('does not create a pending replacement when completion wins a concurrent schedule edit', async () => {
    const cycle = await createFixture();
    const lock = await lockReminderRow(cycle.reminder.id);
    const completion = service.completeReminder(cycle.reminder.id, NOW);
    await waitForBlockedReminderUpdates(1);
    const scheduleEdit = service.updateReminder(cycle.reminder.id, { endDate: '2027-01-01' }, NOW);
    await waitForBlockedReminderUpdates(2);
    lock.release.resolve();
    await lock.finished;

    await expect(completion).resolves.toMatchObject({ status: 'DONE' });
    await expect(scheduleEdit).rejects.toThrow('state changed');
    expect(await prisma.reminder.findUnique({ where: { id: cycle.reminder.id } }))
      .toMatchObject({ status: 'DONE' });
    expect(await prisma.notification.count({
      where: { reminderId: cycle.reminder.id, status: 'PENDING' },
    })).toBe(0);
  });

  it('creates only one child when two renewals race from the same source', async () => {
    const source = await createFixture();
    const firstChild = input(`First racing renewal ${crypto.randomUUID()}`);
    const secondChild = input(`Second racing renewal ${crypto.randomUUID()}`);
    const lock = await lockReminderRow(source.reminder.id);
    const first = service.renewReminder(source.reminder.id, firstChild, NOW);
    await waitForBlockedReminderUpdates(1);
    const second = service.renewReminder(source.reminder.id, secondChild, NOW);
    await waitForBlockedReminderUpdates(2);
    lock.release.resolve();
    await lock.finished;

    await expect(first).resolves.toMatchObject({ reminder: { parentReminderId: source.reminder.id } });
    await expect(second).rejects.toThrow('state changed');
    expect(await prisma.reminder.count({ where: { parentReminderId: source.reminder.id } })).toBe(1);
  });
});
