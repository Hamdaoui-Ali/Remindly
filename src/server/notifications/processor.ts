import type { Notification, Reminder, Settings, UserProfile } from '@/generated/prisma/client';
import {
  emailDeliveryOutcome,
  type EmailProvider,
  type SendEmailInput,
} from '@/server/email/provider';
import { prisma } from '@/server/db/client';
import { SettingsRepository } from '@/server/settings/repository';
import { calculateUrgency } from '@/server/urgency/urgency';
import { reconcileMissingPendingNotifications } from './recovery';
import { NotificationRepository, type ClaimedNotification } from './repository';
import { isCurrentAlertEligible } from './eligibility';
import { finalizeEmailSend } from './budget-repository';
import { DEFAULT_AUTH_RESERVE, DEFAULT_EMAIL_BUDGET, DEFAULT_REMINDER_CLAIM_CEILING, type EmailBudgetPolicy } from './budget';

const MAXIMUM_ATTEMPTS = 5;
const PROCESSING_LEASE_MILLISECONDS = 15 * 60 * 1_000;
const RETRY_DELAYS_MILLISECONDS = [0, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000] as const;
const TERMINAL_LEASE_ERROR = 'Processing lease expired after final attempt';
const DEFINITE_PROVIDER_ERROR = 'Email provider definite failure';
const UNKNOWN_PROVIDER_ERROR = 'Email provider outcome unknown; retry may duplicate without provider idempotency';
const PROCESSING_ERROR = 'Notification processing failed';

export interface ProcessDueNotificationsInput {
  now: Date;
  limit: number;
  provider: EmailProvider;
  budgetPolicy?: EmailBudgetPolicy;
}

export interface ProcessDueNotificationsResult {
  claimed: number;
  sent: number;
  failed: number;
  recovered: number;
}

export function calculateNextAttempt(attemptCount: number, now: Date): Date | null {
  if (!Number.isInteger(attemptCount) || attemptCount < 0 || attemptCount >= MAXIMUM_ATTEMPTS) {
    return null;
  }
  return new Date(now.getTime() + RETRY_DELAYS_MILLISECONDS[attemptCount]);
}

export function requiresLegacySettings(
  claims: Array<Pick<ClaimedNotification, 'reminderAlertId'>>,
): boolean {
  return claims.some((claim) => claim.reminderAlertId === null);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function urgencyLabel(value: ReturnType<typeof calculateUrgency>): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function remindersUrl(): string {
  const baseUrl = process.env.APP_URL ?? 'http://localhost:3000';
  return new URL('/reminders', baseUrl).toString();
}

function buildReminderEmail(
  notification: Notification,
  reminder: Reminder,
  recipient: { email: string; timezone: string },
  now: Date,
): SendEmailInput {
  const endDate = reminder.endDate.toISOString().slice(0, 10);
  const urgency = urgencyLabel(calculateUrgency(endDate, now, recipient.timezone));
  const scheduledContext = notification.scheduledFor.toISOString();
  const url = remindersUrl();
  const subject = `Remindly: ${reminder.name} is ${urgency.toLowerCase()}`;
  const text = [
    reminder.name,
    `End date: ${endDate}`,
    `Urgency: ${urgency}`,
    `Scheduled reminder: ${scheduledContext}`,
    `Open reminder: ${url}`,
  ].join('\n');
  const html = [
    '<h1>Remindly</h1>',
    `<p><strong>${escapeHtml(reminder.name)}</strong></p>`,
    `<p>End date: ${escapeHtml(endDate)}</p>`,
    `<p>Urgency: ${escapeHtml(urgency)}</p>`,
    `<p>Scheduled reminder: ${escapeHtml(scheduledContext)}</p>`,
    `<p><a href="${escapeHtml(url)}">Open reminder</a></p>`,
  ].join('');

  return {
    to: recipient.email,
    subject,
    html,
    text,
    idempotencyKey: notification.id,
  };
}

async function cancelClaim(
  repository: NotificationRepository,
  id: string,
  processingStartedAt: Date,
): Promise<void> {
  await repository.transitionWhenStatus(id, 'PROCESSING', {
    status: 'CANCELLED',
    processingStartedAt: null,
    nextAttemptAt: null,
    expectedProcessingStartedAt: processingStartedAt,
  });
}

async function failClaim(
  repository: NotificationRepository,
  claimed: ClaimedNotification,
  now: Date,
  lastError: string,
): Promise<'failed' | 'cancelled'> {
  if (!claimed.processingStartedAt) return 'cancelled';
  const transitioned = await repository.markFailed(claimed.id, {
    status: 'FAILED',
    providerMessageId: null,
    sentAt: null,
    nextAttemptAt: calculateNextAttempt(claimed.attemptCount, now),
    processingStartedAt: null,
    lastError,
    expectedProcessingStartedAt: claimed.processingStartedAt,
  });
  return transitioned ? 'failed' : 'cancelled';
}

async function processClaimedNotification(
  claimed: ClaimedNotification,
  settings: Settings | null,
  input: ProcessDueNotificationsInput,
  repository: NotificationRepository,
): Promise<'sent' | 'failed' | 'cancelled'> {
  if (!claimed.processingStartedAt) return 'cancelled';
  const current = await repository.findClaimedWithReminder(claimed.id);
  if (!current || current.status !== 'PROCESSING') return 'cancelled';
  if (current.processingStartedAt?.getTime() !== claimed.processingStartedAt.getTime()) {
    return 'cancelled';
  }
  if (
    current.reminder.status !== 'ACTIVE'
  ) {
    await cancelClaim(repository, current.id, claimed.processingStartedAt);
    return 'cancelled';
  }

  let email: SendEmailInput;
  try {
    if (current.alert) {
      const profile = current.alert.reminder.userProfile;
      if (!profile || !isCurrentAlertEligible({
        reminderStatus: current.reminder.status,
        alertEnabled: current.alert.enabled,
        email: profile.email,
        emailVerifiedAt: profile.emailVerifiedAt,
        notificationScheduleVersion: current.scheduleVersion,
        alertScheduleVersion: current.alert.scheduleVersion,
        notificationScheduledFor: current.scheduledFor,
        alertScheduledFor: current.alert.scheduledFor,
      })) {
        await cancelClaim(repository, current.id, claimed.processingStartedAt);
        if (claimed.emailSendAttemptId) await finalizeEmailSend(prisma.emailSendAttempt, claimed.emailSendAttemptId, 'DEFINITE_FAILURE', input.now, { sanitizedCode: 'notification_not_eligible' });
        return 'cancelled';
      }
      email = buildReminderEmail(current, current.reminder, profile, input.now);
    } else {
      if (!settings) throw new Error('Notification settings are unavailable');
      if (current.scheduledFor.getTime() !== current.reminder.alertAt.getTime()) {
        await cancelClaim(repository, current.id, claimed.processingStartedAt);
        if (claimed.emailSendAttemptId) await finalizeEmailSend(prisma.emailSendAttempt, claimed.emailSendAttemptId, 'DEFINITE_FAILURE', input.now, { sanitizedCode: 'notification_schedule_changed' });
        return 'cancelled';
      }
      email = buildReminderEmail(current, current.reminder, {
        email: settings.notificationEmail,
        timezone: settings.timezone,
      }, input.now);
    }
  } catch {
    if (claimed.emailSendAttemptId) await finalizeEmailSend(prisma.emailSendAttempt, claimed.emailSendAttemptId, 'DEFINITE_FAILURE', input.now, { sanitizedCode: 'notification_processing_error' });
    return failClaim(repository, claimed, input.now, PROCESSING_ERROR);
  }

  try {
    const accepted = await input.provider.send(email);
    const transitioned = await repository.markSent(current.id, {
      status: 'SENT',
      providerMessageId: accepted.providerMessageId ?? null,
      sentAt: input.now,
      nextAttemptAt: null,
      processingStartedAt: null,
      lastError: null,
      expectedProcessingStartedAt: claimed.processingStartedAt,
    });
    if (claimed.emailSendAttemptId) await finalizeEmailSend(prisma.emailSendAttempt, claimed.emailSendAttemptId, 'ACCEPTED', input.now, { sanitizedCode: 'email_accepted', providerMessageId: accepted.providerMessageId ?? null });
    return transitioned ? 'sent' : 'cancelled';
  } catch (error) {
    const outcome = emailDeliveryOutcome(error);
    const lastError = outcome === 'definite_failure' ? DEFINITE_PROVIDER_ERROR : UNKNOWN_PROVIDER_ERROR;
    if (claimed.emailSendAttemptId) await finalizeEmailSend(prisma.emailSendAttempt, claimed.emailSendAttemptId, outcome === 'definite_failure' ? 'DEFINITE_FAILURE' : 'UNKNOWN_OUTCOME', input.now, { sanitizedCode: outcome === 'definite_failure' ? 'email_provider_definite_failure' : 'email_provider_unknown_outcome' });
    return failClaim(repository, claimed, input.now, lastError);
  }
}

export async function processDueNotifications(
  input: ProcessDueNotificationsInput,
): Promise<ProcessDueNotificationsResult> {
  const limit = Math.min(100, Math.max(0, Math.trunc(input.limit)));
  if (limit === 0) return { claimed: 0, sent: 0, failed: 0, recovered: 0 };

  const repository = new NotificationRepository(prisma);
  await reconcileMissingPendingNotifications(input.now);
  const leaseExpiredBefore = new Date(input.now.getTime() - PROCESSING_LEASE_MILLISECONDS);
  const terminalLeaseFailures = await repository.reclaimExpiredProcessing({
    leaseExpiredBefore,
    expectedStatus: 'PROCESSING',
    status: 'FAILED',
    processingStartedAt: null,
    incrementAttemptCount: false,
    minimumAttemptCount: MAXIMUM_ATTEMPTS,
    nextAttemptAt: null,
    lastError: TERMINAL_LEASE_ERROR,
  });
  const budgetPolicy = input.budgetPolicy ?? {
    total: DEFAULT_EMAIL_BUDGET,
    authReserve: DEFAULT_AUTH_RESERVE,
    reminderCeiling: DEFAULT_REMINDER_CLAIM_CEILING,
  };
  const claimed = await prisma.$transaction((tx) => new NotificationRepository(tx).claimDueWithBudget({
    now: input.now,
    leaseExpiredBefore,
    limit,
    maximumAttempts: MAXIMUM_ATTEMPTS,
    pendingStatus: 'PENDING',
    failedStatus: 'FAILED',
    processingStatus: 'PROCESSING',
    claimedStatus: 'PROCESSING',
  }, budgetPolicy));
  const settings = requiresLegacySettings(claimed)
    ? await new SettingsRepository(prisma).getSingleton()
    : null;
  const result: ProcessDueNotificationsResult = {
    claimed: claimed.length,
    sent: 0,
    failed: terminalLeaseFailures,
    recovered: terminalLeaseFailures + claimed.filter((notification) => notification.recovered).length,
  };

  for (const notification of claimed) {
    const outcome = await processClaimedNotification(notification, settings, input, repository);
    if (outcome === 'sent') result.sent += 1;
    if (outcome === 'failed') result.failed += 1;
  }

  return result;
}

export { reconcileMissingPendingNotifications };
