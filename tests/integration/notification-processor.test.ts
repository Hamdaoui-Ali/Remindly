import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EmailDelivery, EmailDeliveryResult } from '@/server/email/delivery';
import type { SendEmailInput } from '@/server/email/provider';
import { prisma } from '@/server/db/client';
import {
  processDueNotifications,
  reconcileMissingPendingNotifications,
} from '@/server/notifications/processor';
import { SETTINGS_SINGLETON_ID } from '@/server/settings/repository';

const NOW = new Date('2026-08-19T12:00:00.000Z');
const fixtureNames: string[] = [];
const fixtureProfileIds: string[] = [];
let originalSettings: {
  notificationEmail: string;
  timezone: string;
  defaultAlertTime: string;
} | null = null;

class RecordingEmailDelivery implements EmailDelivery {
  readonly calls: SendEmailInput[] = [];
  readonly accepted = new Map<string, string>();
  readonly failAlways = new Set<string>();
  readonly ambiguousOnce = new Set<string>();

  async send(_purpose: 'REMINDER' | 'AUTH', input: SendEmailInput): Promise<EmailDeliveryResult> {
    this.calls.push(input);
    const existing = this.accepted.get(input.idempotencyKey);
    if (existing) return { status: 'sent', providerMessageId: existing };
    if (this.failAlways.has(input.idempotencyKey)) {
      throw Object.assign(new Error('Provider rejected secret token re_sensitive_should_not_be_stored'), {
        outcome: 'definite_failure',
      });
    }

    const providerMessageId = `fake-${input.idempotencyKey}`;
    this.accepted.set(input.idempotencyKey, providerMessageId);
    if (this.ambiguousOnce.delete(input.idempotencyKey)) {
      throw Object.assign(new Error('Connection dropped after provider acceptance'), {
        outcome: 'unknown_outcome',
      });
    }
    return { status: 'sent', providerMessageId };
  }
}

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
  if (fixtureNames.length > 0) {
    await prisma.reminder.deleteMany({ where: { name: { in: fixtureNames } } });
    fixtureNames.length = 0;
  }
  if (fixtureProfileIds.length > 0) {
    await prisma.userProfile.deleteMany({ where: { id: { in: fixtureProfileIds } } });
    fixtureProfileIds.length = 0;
  }
  if (originalSettings) {
    await prisma.settings.update({ where: { id: SETTINGS_SINGLETON_ID }, data: originalSettings });
  } else {
    await prisma.settings.deleteMany({ where: { id: SETTINGS_SINGLETON_ID } });
  }
  originalSettings = null;
});

async function createReminder(input: {
  name?: string;
  alertAt?: Date;
  endDate?: Date;
} = {}) {
  const name = input.name ?? `Processor reminder ${crypto.randomUUID()}`;
  fixtureNames.push(name);
  return prisma.reminder.create({
    data: {
      name,
      endDate: input.endDate ?? new Date('2026-08-20T00:00:00.000Z'),
      alertLeadDays: 1,
      alertTime: '09:00',
      alertAt: input.alertAt ?? new Date('2026-08-19T11:00:00.000Z'),
    },
  });
}

async function createDueNotification(input: {
  status?: 'PENDING' | 'PROCESSING' | 'FAILED';
  attemptCount?: number;
  processingStartedAt?: Date;
  nextAttemptAt?: Date;
  name?: string;
} = {}) {
  const reminder = await createReminder({ name: input.name });
  const id = crypto.randomUUID();
  const notification = await prisma.notification.create({
    data: {
      id,
      reminderId: reminder.id,
      scheduledFor: reminder.alertAt,
      status: input.status ?? 'PENDING',
      channel: 'EMAIL',
      attemptCount: input.attemptCount ?? 0,
      processingStartedAt: input.processingStartedAt,
      nextAttemptAt: input.nextAttemptAt,
      idempotencyKey: id,
    },
  });
  return { reminder, notification };
}

async function createAlertNotification(input: {
  alertTimes: Date[];
  dueAlertIndexes?: number[];
  profileVerified?: boolean;
  alertEnabled?: boolean;
  scheduleVersion?: number;
  notificationScheduleVersion?: number;
  notificationScheduledFor?: Date;
  reminderName?: string;
}) {
  const profileId = crypto.randomUUID();
  fixtureProfileIds.push(profileId);
  const profile = await prisma.userProfile.create({
    data: {
      id: profileId,
      email: `processor-${profileId}@example.com`,
      emailVerifiedAt: input.profileVerified === false ? null : NOW,
      timezone: 'Africa/Casablanca',
    },
  });
  const reminder = await createReminder({
    name: input.reminderName,
    alertAt: new Date('2026-08-20T11:00:00.000Z'),
  });
  await prisma.reminder.update({ where: { id: reminder.id }, data: { userId: profile.id } });
  const alerts = await Promise.all(input.alertTimes.map((scheduledFor, index) => prisma.reminderAlert.create({
    data: {
      reminderId: reminder.id,
      scheduledFor,
      scheduleVersion: input.scheduleVersion ?? 1,
      enabled: index === 0 ? input.alertEnabled ?? true : true,
      channel: 'EMAIL',
    },
  })));
  const dueAlertIndexes = input.dueAlertIndexes ?? alerts.map((_, index) => index);
  const notifications = await Promise.all(dueAlertIndexes.map((index) => {
    const alert = alerts[index];
    if (!alert) throw new Error(`Missing alert fixture at index ${index}`);
    const id = crypto.randomUUID();
    return prisma.notification.create({
      data: {
        id,
        reminderId: reminder.id,
        reminderAlertId: alert.id,
        scheduledFor: input.notificationScheduledFor ?? alert.scheduledFor,
        scheduleVersion: input.notificationScheduleVersion ?? alert.scheduleVersion,
        status: 'PENDING',
        channel: 'EMAIL',
        idempotencyKey: id,
      },
    });
  }));
  return { profile, reminder, alerts, notifications };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => { resolve = next; });
  return { promise, resolve };
}

async function updateReminderWhileLocked(id: string, alertAt: Date) {
  const locked = deferred();
  const release = deferred();
  const finished = prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM reminders WHERE id = ${id}::uuid FOR UPDATE`;
    await tx.reminder.update({ where: { id }, data: { alertAt } });
    locked.resolve();
    await release.promise;
  });
  await locked.promise;
  return { release, finished };
}

async function waitForReconciliationLock() {
  await expect.poll(async () => {
    const rows = await prisma.$queryRaw<Array<{ waiting: bigint }>>`
      SELECT count(*)::bigint AS waiting
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND wait_event_type = 'Lock'
        AND query LIKE ${'%INSERT INTO notifications%'}
    `;
    return Number(rows[0]?.waiting ?? 0n);
  }, { timeout: 5_000, interval: 20 }).toBeGreaterThan(0);
}

describe('processDueNotifications', () => {
  it('does not claim reminder notifications when the reminder budget is exhausted', async () => {
    const { notification } = await createDueNotification();
    const delivery = new RecordingEmailDelivery();

    const result = await processDueNotifications({
      now: NOW,
      limit: 20,
      delivery,
      budgetPolicy: { total: 0, authReserve: 0, reminderCeiling: 0 },
    });

    expect(result).toEqual({ claimed: 0, sent: 0, failed: 0, recovered: 0 });
    expect(delivery.calls).toHaveLength(0);
    expect(await prisma.notification.findUnique({ where: { id: notification.id } }))
      .toMatchObject({ status: 'PENDING', attemptCount: 0 });
  });

  it('sends each due alert to the verified profile and leaves future alerts pending', async () => {
    const firstAlertAt = new Date('2026-08-19T11:00:00.000Z');
    const secondAlertAt = new Date('2026-08-19T11:30:00.000Z');
    const futureAlertAt = new Date('2026-08-20T11:00:00.000Z');
    const { profile, alerts, notifications } = await createAlertNotification({
      alertTimes: [firstAlertAt, secondAlertAt, futureAlertAt],
      dueAlertIndexes: [0, 1],
    });
    const provider = new RecordingEmailDelivery();

    const result = await processDueNotifications({ now: NOW, limit: 20, delivery: provider });

    expect(result).toMatchObject({ claimed: 2, sent: 2, failed: 0 });
    expect(provider.calls).toHaveLength(2);
    expect(provider.calls.every((call) => call.to === profile.email)).toBe(true);
    expect(await prisma.notification.findMany({
      where: { id: { in: notifications.map((notification) => notification.id) } },
      orderBy: { scheduledFor: 'asc' },
    })).toMatchObject([
      { reminderAlertId: alerts[0]?.id, status: 'SENT' },
      { reminderAlertId: alerts[1]?.id, status: 'SENT' },
    ]);
  });

  it.each([
    ['disabled alert', { alertEnabled: false }],
    ['unverified profile', { profileVerified: false }],
    ['stale schedule version', { scheduleVersion: 2, notificationScheduleVersion: 1 }],
    ['mismatched schedule timestamp', {
      notificationScheduledFor: new Date('2026-08-19T11:01:00.000Z'),
    }],
  ])('cancels a %s before sending', async (_label, options) => {
    const { notifications } = await createAlertNotification({
      alertTimes: [new Date('2026-08-19T11:00:00.000Z')],
      ...options,
    });
    const provider = new RecordingEmailDelivery();

    const result = await processDueNotifications({ now: NOW, limit: 20, delivery: provider });

    expect(result.sent).toBe(0);
    expect(provider.calls).toHaveLength(0);
    expect(await prisma.notification.findUnique({ where: { id: notifications[0]?.id } }))
      .toMatchObject({ status: 'CANCELLED', processingStartedAt: null });
  });

  it('reconciles a missing current ledger row and sends it in the same processor run', async () => {
    const reminder = await createReminder();
    const provider = new RecordingEmailDelivery();

    const result = await processDueNotifications({ now: NOW, limit: 20, delivery: provider });
    const notifications = await prisma.notification.findMany({ where: { reminderId: reminder.id } });

    expect(result).toEqual({ claimed: 1, sent: 1, failed: 0, recovered: 0 });
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]?.idempotencyKey).toBe(notifications[0]?.id);
    expect(notifications).toMatchObject([{
      scheduledFor: reminder.alertAt,
      status: 'SENT',
      attemptCount: 1,
    }]);
    expect(notifications[0]?.idempotencyKey).toBe(notifications[0]?.id);
  });

  it('claims a due row once when two processors run concurrently', async () => {
    const { notification } = await createDueNotification();
    const provider = new RecordingEmailDelivery();
    const [first, second] = await Promise.all([
      processDueNotifications({ now: NOW, limit: 20, delivery: provider }),
      processDueNotifications({ now: NOW, limit: 20, delivery: provider }),
    ]);

    expect(first.sent + second.sent).toBe(1);
    expect(first.claimed + second.claimed).toBe(1);
    expect(provider.calls.filter((call) => call.idempotencyKey === notification.id)).toHaveLength(1);
    expect(await prisma.notification.findUnique({ where: { id: notification.id } }))
      .toMatchObject({ status: 'SENT', attemptCount: 1 });
  });

  it('recovers a processing row after its 15-minute lease and retains its UUID', async () => {
    const { notification } = await createDueNotification({
      status: 'PROCESSING',
      attemptCount: 1,
      processingStartedAt: new Date('2026-08-19T11:44:59.999Z'),
    });
    const provider = new RecordingEmailDelivery();

    const result = await processDueNotifications({ now: NOW, limit: 20, delivery: provider });

    expect(result).toEqual({ claimed: 1, sent: 1, failed: 0, recovered: 1 });
    expect(provider.calls[0]?.idempotencyKey).toBe(notification.id);
    expect(await prisma.notification.findUnique({ where: { id: notification.id } }))
      .toMatchObject({ status: 'SENT', attemptCount: 2, idempotencyKey: notification.id });
  });

  it('does not reclaim a processing row whose lease is exactly 15 minutes old', async () => {
    const { notification } = await createDueNotification({
      status: 'PROCESSING',
      attemptCount: 1,
      processingStartedAt: new Date('2026-08-19T11:45:00.000Z'),
    });
    const provider = new RecordingEmailDelivery();

    const result = await processDueNotifications({ now: NOW, limit: 20, delivery: provider });

    expect(result).toEqual({ claimed: 0, sent: 0, failed: 0, recovered: 0 });
    expect(provider.calls).toHaveLength(0);
    expect(await prisma.notification.findUnique({ where: { id: notification.id } }))
      .toMatchObject({ status: 'PROCESSING', attemptCount: 1 });
  });

  it('terminalizes an expired fifth-attempt lease without making a sixth provider call', async () => {
    const { notification } = await createDueNotification({
      status: 'PROCESSING',
      attemptCount: 5,
      processingStartedAt: new Date('2026-08-19T11:44:59.999Z'),
    });
    const provider = new RecordingEmailDelivery();

    const result = await processDueNotifications({ now: NOW, limit: 20, delivery: provider });

    expect(result).toEqual({ claimed: 0, sent: 0, failed: 1, recovered: 1 });
    expect(provider.calls).toHaveLength(0);
    expect(await prisma.notification.findUnique({ where: { id: notification.id } }))
      .toMatchObject({
        status: 'FAILED',
        attemptCount: 5,
        processingStartedAt: null,
        nextAttemptAt: null,
        lastError: 'Processing lease expired after final attempt',
      });
  });

  it('re-checks reminder state and cancels a claimed row before calling the provider', async () => {
    const { reminder, notification } = await createDueNotification();
    await prisma.reminder.update({ where: { id: reminder.id }, data: { status: 'DONE', completedAt: NOW } });
    const provider = new RecordingEmailDelivery();

    const result = await processDueNotifications({ now: NOW, limit: 20, delivery: provider });

    expect(result).toEqual({ claimed: 1, sent: 0, failed: 0, recovered: 0 });
    expect(provider.calls).toHaveLength(0);
    expect(await prisma.notification.findUnique({ where: { id: notification.id } }))
      .toMatchObject({ status: 'CANCELLED', processingStartedAt: null });
  });

  it('cancels a claimed notification whose schedule is no longer current', async () => {
    const { reminder, notification } = await createDueNotification();
    await prisma.reminder.update({
      where: { id: reminder.id },
      data: { alertAt: new Date('2026-08-20T11:00:00.000Z') },
    });
    const provider = new RecordingEmailDelivery();

    const result = await processDueNotifications({ now: NOW, limit: 20, delivery: provider });

    expect(result).toEqual({ claimed: 1, sent: 0, failed: 0, recovered: 0 });
    expect(provider.calls).toHaveLength(0);
    expect(await prisma.notification.findUnique({ where: { id: notification.id } }))
      .toMatchObject({ status: 'CANCELLED', processingStartedAt: null });
  });

  it('isolates failed rows, stores a sanitized error, and sends the rest of the batch', async () => {
    const failing = await createDueNotification({ name: `Failing ${crypto.randomUUID()}` });
    const passing = await createDueNotification({ name: `Passing ${crypto.randomUUID()}` });
    const provider = new RecordingEmailDelivery();
    provider.failAlways.add(failing.notification.id);

    const result = await processDueNotifications({ now: NOW, limit: 20, delivery: provider });

    expect(result).toEqual({ claimed: 2, sent: 1, failed: 1, recovered: 0 });
    expect(await prisma.notification.findUnique({ where: { id: failing.notification.id } }))
      .toMatchObject({
        status: 'FAILED',
        attemptCount: 1,
        lastError: 'Email provider definite failure',
        nextAttemptAt: new Date('2026-08-19T12:05:00.000Z'),
      });
    expect(await prisma.notification.findUnique({ where: { id: passing.notification.id } }))
      .toMatchObject({ status: 'SENT' });
  });

  it('reuses the notification UUID so an ambiguous retry is accepted once logically', async () => {
    const { notification } = await createDueNotification();
    const provider = new RecordingEmailDelivery();
    provider.ambiguousOnce.add(notification.id);

    await processDueNotifications({ now: NOW, limit: 20, delivery: provider });
    expect(await prisma.notification.findUnique({ where: { id: notification.id } }))
      .toMatchObject({
        status: 'FAILED',
        lastError: 'Email provider outcome unknown; retry may duplicate without provider idempotency',
      });
    const retried = await processDueNotifications({
      now: new Date('2026-08-19T12:05:00.000Z'),
      limit: 20,
      delivery: provider,
    });

    expect(retried.sent).toBe(1);
    expect(provider.calls.map((call) => call.idempotencyKey)).toEqual([notification.id, notification.id]);
    expect(provider.accepted.size).toBe(1);
    expect(await prisma.notification.findUnique({ where: { id: notification.id } }))
      .toMatchObject({ status: 'SENT', attemptCount: 2, idempotencyKey: notification.id });
  });

  it('leaves a fifth failed attempt terminal with no next attempt', async () => {
    const { notification } = await createDueNotification({
      status: 'FAILED',
      attemptCount: 4,
      nextAttemptAt: NOW,
    });
    const provider = new RecordingEmailDelivery();
    provider.failAlways.add(notification.id);

    await processDueNotifications({ now: NOW, limit: 20, delivery: provider });
    await processDueNotifications({ now: new Date('2026-08-21T12:00:00.000Z'), limit: 20, delivery: provider });

    expect(provider.calls).toHaveLength(1);
    expect(await prisma.notification.findUnique({ where: { id: notification.id } }))
      .toMatchObject({ status: 'FAILED', attemptCount: 5, nextAttemptAt: null });
  });

  it('builds email copy with the reminder, date, urgency, schedule, and authenticated link', async () => {
    const name = 'Passport <renewal>';
    const { reminder } = await createDueNotification({ name });
    const provider = new RecordingEmailDelivery();

    await processDueNotifications({ now: NOW, limit: 20, delivery: provider });

    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]).toMatchObject({
      to: 'owner@example.com',
      idempotencyKey: expect.any(String),
    });
    expect(provider.calls[0]?.subject).toContain(name);
    expect(provider.calls[0]?.text).toContain('2026-08-20');
    expect(provider.calls[0]?.text).toContain('Urgent');
    expect(provider.calls[0]?.text).toContain(reminder.alertAt.toISOString());
    expect(provider.calls[0]?.text).toContain('/reminders');
    expect(provider.calls[0]?.html).toContain('Passport &lt;renewal&gt;');
    expect(provider.calls[0]?.html).not.toContain('Passport <renewal>');
  });
});

describe('reconcileMissingPendingNotifications', () => {
  it('creates one current pending row when concurrent recovery passes find a missing ledger entry', async () => {
    const reminder = await createReminder();

    const counts = await Promise.all([
      reconcileMissingPendingNotifications(NOW),
      reconcileMissingPendingNotifications(NOW),
    ]);
    const rows = await prisma.notification.findMany({ where: { reminderId: reminder.id } });

    expect(counts[0] + counts[1]).toBe(1);
    expect(rows).toMatchObject([{
      scheduledFor: reminder.alertAt,
      status: 'PENDING',
      channel: 'EMAIL',
    }]);
    expect(rows[0]?.idempotencyKey).toBe(rows[0]?.id);
  });

  it('skips a reminder locked by a schedule edit and later reconciles only its committed schedule', async () => {
    const reminder = await createReminder();
    const nextAlertAt = new Date('2026-08-20T11:00:00.000Z');
    const lock = await updateReminderWhileLocked(reminder.id, nextAlertAt);
    const reconciliation = reconcileMissingPendingNotifications(NOW);
    const outcome = await Promise.race([
      reconciliation.then((count) => ({ kind: 'completed' as const, count })),
      waitForReconciliationLock().then(() => ({ kind: 'blocked' as const, count: -1 })),
    ]);
    lock.release.resolve();
    await lock.finished;
    if (outcome.kind === 'blocked') await reconciliation;

    expect(outcome).toEqual({ kind: 'completed', count: 0 });
    expect(await reconcileMissingPendingNotifications(NOW)).toBe(1);
    expect(await prisma.notification.findMany({ where: { reminderId: reminder.id } }))
      .toMatchObject([{ scheduledFor: nextAlertAt, status: 'PENDING' }]);
  });
});
