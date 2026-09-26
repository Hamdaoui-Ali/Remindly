import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { ZodError } from 'zod';

import { createConfiguredEmailDelivery } from '@/server/email/configured-delivery';
import { processDueNotifications } from '@/server/notifications/processor';
import { completeProcessorRun, startProcessorRun } from '@/server/notifications/processor-run';
import { prisma } from '@/server/db/client';

const PROCESSOR_BATCH_LIMIT = 50;
const CONFIGURATION_FIELDS = new Set([
  'APP_URL',
  'DATABASE_URL',
  'EMAIL_PROVIDER',
  'GMAIL_AUTH_HOOK_TOTAL_TIMEOUT_MS',
  'GMAIL_AUTH_RESERVE',
  'GMAIL_CLIENT_ID',
  'GMAIL_CLIENT_SECRET',
  'GMAIL_REFRESH_TOKEN',
  'GMAIL_REQUEST_TIMEOUT_MS',
  'GMAIL_SENDER_EMAIL',
  'GMAIL_SENDER_NAME',
  'GMAIL_TOTAL_DAILY_BUDGET',
  'RESEND_API_KEY',
  'RESEND_FROM',
  'SCHEDULER_SECRET',
  'SUPABASE_SEND_EMAIL_HOOK_SECRET',
]);

export function notificationProcessorFailureCode(error: unknown): string {
  if (error instanceof ZodError) {
    const field = error.issues
      .map((issue) => issue.path[0])
      .find((value): value is string => (
        typeof value === 'string' && CONFIGURATION_FIELDS.has(value)
      ));
    if (field) return `notification_processor_config_${field}`;
  }
  return 'notification_processor_failed';
}

function secretDigest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

export function schedulerSecretMatches(
  providedSecret: string | null,
  expectedSecret: string,
): boolean {
  const providedDigest = secretDigest(providedSecret ?? '');
  const expectedDigest = secretDigest(expectedSecret);
  return timingSafeEqual(providedDigest, expectedDigest);
}

function configuredSchedulerSecret(): string | null {
  const value = process.env.SCHEDULER_SECRET;
  return typeof value === 'string' && value.trim().length >= 16 ? value : null;
}

export async function POST(request: Request) {
  const expectedSecret = configuredSchedulerSecret();
  if (
    !expectedSecret
    || !schedulerSecretMatches(
      request.headers.get('x-scheduler-secret'),
      expectedSecret,
    )
  ) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const runId = randomUUID();
  let processorRunId: string | null = null;
  try {
    const run = await startProcessorRun(prisma, new Date());
    processorRunId = run.id;
    const delivery = createConfiguredEmailDelivery();
    const counts = await processDueNotifications({
      now: new Date(),
      limit: PROCESSOR_BATCH_LIMIT,
      delivery,
    });
    await completeProcessorRun(prisma, processorRunId, 'SUCCEEDED', counts, new Date());

    console.info('notification-processor completed', { runId, ...counts });
    return Response.json(counts);
  } catch (error) {
    const failureCode = notificationProcessorFailureCode(error);
    if (processorRunId) {
      await completeProcessorRun(prisma, processorRunId, 'FAILED', {
        claimed: 0, sent: 0, failed: 0, recovered: 0,
      }, new Date(), failureCode).catch(() => undefined);
    }
    console.error('notification-processor failed', { runId, failureCode });
    return Response.json(
      { error: 'Notification processing failed' },
      { status: 500 },
    );
  }
}
