import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Webhook } from 'standardwebhooks';

const send = vi.fn(async () => ({ status: 'sent' as const }));
vi.mock('@/server/email/configured-delivery', () => ({
  createConfiguredEmailDelivery: () => ({ send }),
}));

import { POST } from '@/app/api/internal/auth/send-email/route';

const rawSecret = Buffer.from('test-hook-secret').toString('base64');
const configuredSecret = `v1,whsec_${rawSecret}`;
const payload = JSON.stringify({
  user: { email: 'person@example.com' },
  email_data: {
    token: 'token-1', token_hash: 'hash-1', email_action_type: 'signup', site_url: 'http://localhost:3000',
  },
});

afterEach(() => {
  delete process.env.SUPABASE_SEND_EMAIL_HOOK_SECRET;
  send.mockClear();
});

beforeEach(() => {
  process.env.SCHEDULER_SECRET = 's'.repeat(16);
  process.env.RESEND_API_KEY = 're_test';
  process.env.RESEND_FROM = 'Remindly <notifications@example.com>';
  process.env.APP_URL = 'http://localhost:3000';
});

function request(body = payload, valid = true) {
  const webhook = new Webhook(rawSecret);
  const id = 'msg-1';
  const timestamp = new Date();
  return new Request('http://localhost/api/internal/auth/send-email', {
    method: 'POST',
    body,
    headers: {
      'webhook-id': id,
      'webhook-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
      'webhook-signature': valid ? webhook.sign(id, timestamp, body) : 'v1,invalid',
    },
  });
}

describe('POST /api/internal/auth/send-email', () => {
  it('rejects invalid Standard Webhooks signatures before payload use', async () => {
    process.env.SUPABASE_SEND_EMAIL_HOOK_SECRET = configuredSecret;

    const response = await POST(request(payload, false));

    expect(response.status).toBe(401);
    expect(send).not.toHaveBeenCalled();
  });

  it('returns a stable success response for a verified hook', async () => {
    process.env.SUPABASE_SEND_EMAIL_HOOK_SECRET = configuredSecret;

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({});
    expect(send).toHaveBeenCalledWith('AUTH', expect.objectContaining({ to: 'person@example.com' }));
  });

  it('rejects verified malformed payloads without provider calls', async () => {
    process.env.SUPABASE_SEND_EMAIL_HOOK_SECRET = configuredSecret;

    const response = await POST(request(JSON.stringify({ bad: true })));

    expect(response.status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });
});
