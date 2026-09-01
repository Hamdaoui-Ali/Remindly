import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';

import { serverEnv } from '@/lib/env';
import { createEmailProvider } from '@/server/email/provider-factory';
import { processDueNotifications } from '@/server/notifications/processor';
import { completeProcessorRun, startProcessorRun } from '@/server/notifications/processor-run';
import { prisma } from '@/server/db/client';

const PROCESSOR_BATCH_LIMIT = 50;

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
  let env: ReturnType<typeof serverEnv>;

  try {
    env = serverEnv();
  } catch {
    console.error('notification-processor configuration-error', { runId });
    return Response.json(
      { error: 'Notification processing failed' },
      { status: 500 },
    );
  }

  let processorRunId: string | null = null;
  try {
    const run = await startProcessorRun(prisma, new Date());
    processorRunId = run.id;
    const provider = createEmailProvider({
      emailProvider: env.EMAIL_PROVIDER,
      gmailClientId: env.GMAIL_CLIENT_ID,
      gmailClientSecret: env.GMAIL_CLIENT_SECRET,
      gmailRefreshToken: env.GMAIL_REFRESH_TOKEN,
      gmailSenderEmail: env.GMAIL_SENDER_EMAIL,
      gmailSenderName: env.GMAIL_SENDER_NAME,
      gmailRequestTimeoutMs: env.GMAIL_REQUEST_TIMEOUT_MS,
      resendApiKey: env.RESEND_API_KEY,
      resendFrom: env.RESEND_FROM,
    });
    const counts = await processDueNotifications({
      now: new Date(),
      limit: PROCESSOR_BATCH_LIMIT,
      provider,
    });
    await completeProcessorRun(prisma, processorRunId, 'SUCCEEDED', counts, new Date());

    console.info('notification-processor completed', { runId, ...counts });
    return Response.json(counts);
  } catch {
    if (processorRunId) {
      await completeProcessorRun(prisma, processorRunId, 'FAILED', {
        claimed: 0, sent: 0, failed: 0, recovered: 0,
      }, new Date(), 'notification_processor_failed').catch(() => undefined);
    }
    console.error('notification-processor failed', { runId });
    return Response.json(
      { error: 'Notification processing failed' },
      { status: 500 },
    );
  }
}
