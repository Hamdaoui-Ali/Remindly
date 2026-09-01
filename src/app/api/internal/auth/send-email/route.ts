import { Webhook } from 'standardwebhooks';
import { randomUUID } from 'node:crypto';
import { serverEnv } from '@/lib/env';
import { createConfiguredEmailDelivery } from '@/server/email/configured-delivery';
import { buildAuthEmail, parseAuthHookPayload } from '@/server/auth/send-email-hook';

const FAILURE_MESSAGE = 'Authentication email delivery is temporarily unavailable';

function failure(httpCode: 400 | 401 | 429 | 503) {
  return Response.json({ error: { http_code: httpCode, message: FAILURE_MESSAGE } }, { status: httpCode });
}

export async function POST(request: Request) {
  const runId = randomUUID();
  const startedAt = Date.now();
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return failure(400);
  }

  let env: ReturnType<typeof serverEnv>;
  try {
    env = serverEnv();
  } catch {
    return failure(503);
  }

  const configured = env.SUPABASE_SEND_EMAIL_HOOK_SECRET;
  const secret = configured?.replace(/^v1,whsec_/, '');
  if (!secret) return failure(503);

  let payload: unknown;
  try {
    payload = new Webhook(secret).verify(rawBody, {
      'webhook-id': request.headers.get('webhook-id') ?? '',
      'webhook-timestamp': request.headers.get('webhook-timestamp') ?? '',
      'webhook-signature': request.headers.get('webhook-signature') ?? '',
    });
  } catch {
    return failure(401);
  }

  let parsed: ReturnType<typeof parseAuthHookPayload>;
  let email: ReturnType<typeof buildAuthEmail>;
  try {
    parsed = parseAuthHookPayload(payload);
    email = buildAuthEmail(parsed, env.APP_URL);
  } catch {
    return failure(400);
  }

  try {
    const delivery = createConfiguredEmailDelivery();
    const timeout = env.GMAIL_AUTH_HOOK_TOTAL_TIMEOUT_MS;
    const result = await Promise.race([
      delivery.send('AUTH', email),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('auth_hook_timeout')), timeout)),
    ]);
    if (result.status === 'blocked') return failure(429);
    console.info('auth-email-hook completed', { runId, action: parsed.email_data.email_action_type, durationMs: Date.now() - startedAt });
    return Response.json({}, { status: 200 });
  } catch (error) {
    const message = error instanceof Error && error.message === 'auth_hook_timeout' ? 'timeout' : 'failure';
    console.error('auth-email-hook failed', { runId, durationMs: Date.now() - startedAt, code: message });
    return failure(503);
  }
}
