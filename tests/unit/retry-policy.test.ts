import { describe, expect, it } from 'vitest';
import type { SendEmailInput } from '@/server/email/provider';
import { ResendEmailProvider, type ResendClient } from '@/server/email/resend-provider';
import { calculateNextAttempt } from '@/server/notifications/processor';

const NOW = new Date('2026-08-19T12:00:00.000Z');

describe('calculateNextAttempt', () => {
  it.each([
    [0, '2026-08-19T12:00:00.000Z'],
    [1, '2026-08-19T12:05:00.000Z'],
    [2, '2026-08-19T12:30:00.000Z'],
    [3, '2026-08-19T14:00:00.000Z'],
    [4, '2026-08-20T00:00:00.000Z'],
  ])('schedules attempt count %i at %s', (attemptCount, expected) => {
    expect(calculateNextAttempt(attemptCount, NOW)).toEqual(new Date(expected));
  });

  it('stops automatic retries after the fifth failed attempt', () => {
    expect(calculateNextAttempt(5, NOW)).toBeNull();
  });
});

describe('ResendEmailProvider', () => {
  it('maps provider-neutral email fields and sends the notification UUID as the idempotency key', async () => {
    const requests: Array<{ body: unknown; options: unknown }> = [];
    const client: ResendClient = {
      emails: {
        async send(body, options) {
          requests.push({ body, options });
          return { data: { id: 'resend-message-123' }, error: null, headers: null };
        },
      },
    };
    const provider = new ResendEmailProvider({
      apiKey: 'not-used-by-the-fake',
      from: 'Remindly <notifications@example.com>',
      client,
    });
    const email: SendEmailInput = {
      to: 'owner@example.com',
      subject: 'Reminder due',
      html: '<p>Renew passport</p>',
      text: 'Renew passport',
      idempotencyKey: '1e4785b7-7a88-46f0-8b61-bb76dd356bd7',
    };

    await expect(provider.send(email)).resolves.toEqual({ providerMessageId: 'resend-message-123' });
    expect(requests).toEqual([{
      body: {
        from: 'Remindly <notifications@example.com>',
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
      },
      options: { idempotencyKey: email.idempotencyKey },
    }]);
  });
});
