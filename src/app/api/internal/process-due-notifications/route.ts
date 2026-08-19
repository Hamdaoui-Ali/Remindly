import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';

import { serverEnv } from '@/lib/env';
import { ResendEmailProvider } from '@/server/email/resend-provider';
import { processDueNotifications } from '@/server/notifications/processor';

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

export async function POST(request: Request) {
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

  if (!schedulerSecretMatches(
    request.headers.get('x-scheduler-secret'),
    env.SCHEDULER_SECRET,
  )) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const provider = new ResendEmailProvider({
      apiKey: env.RESEND_API_KEY,
      from: env.RESEND_FROM,
    });
    const counts = await processDueNotifications({
      now: new Date(),
      limit: PROCESSOR_BATCH_LIMIT,
      provider,
    });

    console.info('notification-processor completed', { runId, ...counts });
    return Response.json(counts);
  } catch {
    console.error('notification-processor failed', { runId });
    return Response.json(
      { error: 'Notification processing failed' },
      { status: 500 },
    );
  }
}
