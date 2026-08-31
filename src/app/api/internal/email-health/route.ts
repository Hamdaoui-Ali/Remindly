import { createHash, timingSafeEqual } from 'node:crypto';
import { serverEnv } from '@/lib/env';
import { prisma } from '@/server/db/client';
import { readGmailCircuitState } from '@/server/email/circuit-state';

function matches(provided: string | null, expected: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(provided ?? ''), digest(expected));
}

export async function GET(request: Request) {
  let expected: string;
  try {
    expected = serverEnv().SCHEDULER_SECRET;
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!matches(request.headers.get('x-scheduler-secret'), expected)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const state = await readGmailCircuitState(prisma);
    return Response.json({
      state: state.state.toLowerCase(),
      failureCount: state.failureCount,
      openedAt: state.openedAt?.toISOString() ?? null,
      lastFailureCode: state.lastFailureCode,
    });
  } catch {
    return Response.json({ error: 'Email health unavailable' }, { status: 503 });
  }
}
