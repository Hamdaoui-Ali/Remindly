import { randomUUID } from 'node:crypto';

import { serverEnv } from '@/lib/env';
import { createConfiguredEmailDelivery } from '@/server/email/configured-delivery';
import { withReminderRecipientOverride } from '@/server/email/delivery';
import { processDueNotifications } from '@/server/notifications/processor';
import { completeProcessorRun, startProcessorRun } from '@/server/notifications/processor-run';
import { prisma } from '@/server/db/client';
import { notificationProcessorFailureCode } from '@/server/notifications/configuration-failure';
import {
  configuredSchedulerSecret,
  schedulerSecretMatches,
} from '@/server/notifications/scheduler-auth';

export { notificationProcessorFailureCode } from '@/server/notifications/configuration-failure';

const PROCESSOR_BATCH_LIMIT = 50;

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
    const environment = serverEnv();
    const delivery = withReminderRecipientOverride(
      createConfiguredEmailDelivery(),
      environment.REMINDER_RECIPIENT_OVERRIDE,
    );
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
