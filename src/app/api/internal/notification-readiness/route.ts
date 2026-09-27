import { prisma } from '@/server/db/client';
import { readNotificationReadiness } from '@/server/notifications/readiness-service';
import {
  configuredSchedulerSecret,
  schedulerSecretMatches,
} from '@/server/notifications/scheduler-auth';

function runtimeEmailProvider(): 'resend' | 'gmail' | 'missing' | 'invalid' {
  const value = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (value === 'resend' || value === 'gmail') return value;
  return value ? 'invalid' : 'missing';
}

export async function GET(request: Request) {
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

  try {
    const result = await readNotificationReadiness(prisma, new Date());
    return Response.json(
      {
        status: result.ready ? 'ready' : 'degraded',
        issues: result.issues,
        provider: runtimeEmailProvider(),
      },
      { status: result.ready ? 200 : 503 },
    );
  } catch {
    return Response.json(
      {
        status: 'degraded',
        issues: ['readiness:unavailable'],
        provider: runtimeEmailProvider(),
      },
      { status: 503 },
    );
  }
}
