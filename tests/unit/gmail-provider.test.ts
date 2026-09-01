import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SendEmailInput } from '@/server/email/provider';
import { GmailEmailProvider } from '@/server/email/gmail-provider';
import { GmailOAuthClient } from '@/server/email/gmail-oauth';
import { GmailDeliveryError } from '@/server/email/errors';
import { buildMimeMessage } from '@/server/email/mime';

const email: SendEmailInput = {
  to: 'person@example.com',
  subject: 'Reminder: Renew passport',
  html: '<p>Renew passport &amp; travel</p>',
  text: 'Renew passport & travel',
  idempotencyKey: 'notification-1',
};

describe('buildMimeMessage', () => {
  it('creates a base64url multipart message with safe headers and both body formats', () => {
    const encoded = buildMimeMessage({
      from: 'Remindly <remindly@example.com>',
      ...email,
    });
    const decoded = Buffer.from(encoded, 'base64url').toString('utf8');

    expect(decoded).toContain('From: Remindly <remindly@example.com>\r\n');
    expect(decoded).toContain('To: person@example.com\r\n');
    expect(decoded).toContain('Content-Type: multipart/alternative;');
    expect(decoded).toContain('Renew passport & travel');
    expect(decoded).toContain('<p>Renew passport &amp; travel</p>');
  });

  it('rejects header injection in addresses and subjects', () => {
    expect(() => buildMimeMessage({ from: 'Remindly\r\nBcc: evil@example.com', ...email })).toThrow(GmailDeliveryError);
    expect(() => buildMimeMessage({ from: 'Remindly <remindly@example.com>', ...email, subject: 'bad\nsubject' })).toThrow(GmailDeliveryError);
  });
});

describe('GmailOAuthClient', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('refreshes once and reuses a token while it has more than sixty seconds left', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ access_token: 'access-1', expires_in: 3600 }),
      { status: 200 },
    ));
    const oauth = new GmailOAuthClient({ clientId: 'client', clientSecret: 'secret', refreshToken: 'refresh' });

    await expect(oauth.getAccessToken()).resolves.toBe('access-1');
    await expect(oauth.getAccessToken()).resolves.toBe('access-1');
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe('GmailEmailProvider', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('refreshes credentials, sends Gmail raw MIME, and returns the provider message id', async () => {
    const requests: Request[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      if (request.url.includes('oauth2.googleapis.com')) {
        return new Response(JSON.stringify({ access_token: 'access-1', expires_in: 3600 }), { status: 200 });
      }
      return new Response(JSON.stringify({ id: 'gmail-message-1' }), { status: 200 });
    });
    const provider = new GmailEmailProvider({
      from: 'Remindly <remindly@example.com>',
      oauth: new GmailOAuthClient({ clientId: 'client', clientSecret: 'secret', refreshToken: 'refresh' }),
    });

    await expect(provider.send(email)).resolves.toEqual({ providerMessageId: 'gmail-message-1' });
    const sendRequest = requests.find((request) => request.url.includes('messages/send'))!;
    expect(sendRequest.headers.get('authorization')).toBe('Bearer access-1');
    expect(JSON.parse(await sendRequest.text())).toEqual(expect.objectContaining({ raw: expect.any(String) }));
  });

  it('propagates an already-aborted delivery signal to OAuth and Gmail requests', async () => {
    const controller = new AbortController();
    controller.abort();
    const oauth = { getAccessToken: vi.fn(async (signal?: AbortSignal) => {
      expect(signal?.aborted).toBe(true);
      throw new GmailDeliveryError('provider_unavailable', 'gmail_oauth_transport', 'unknown_outcome');
    }) } as unknown as GmailOAuthClient;
    const provider = new GmailEmailProvider({ oauth, from: 'Remindly <remindly@example.com>' });

    await expect(provider.send({ ...email, signal: controller.signal })).rejects.toMatchObject({
      code: 'gmail_oauth_transport',
      outcome: 'unknown_outcome',
    });
  });

  it.each([
    [400, 'permanent', 'gmail_invalid_message'],
    [401, 'auth_revoked', 'gmail_auth_revoked'],
    [429, 'rate_limited', 'gmail_429'],
    [503, 'provider_unavailable', 'gmail_5xx'],
  ] as const)('classifies Gmail %i as %s', async (status, kind, code) => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => new Response(
      input.toString().includes('oauth2.googleapis.com')
        ? JSON.stringify({ access_token: 'access-1', expires_in: 3600 })
        : JSON.stringify({ error: { status: 'FAILED_PRECONDITION' } }),
      { status: input.toString().includes('oauth2.googleapis.com') ? 200 : status },
    ));
    const provider = new GmailEmailProvider({
      from: 'Remindly <remindly@example.com>',
      oauth: new GmailOAuthClient({ clientId: 'client', clientSecret: 'secret', refreshToken: 'refresh' }),
    });

    await expect(provider.send(email)).rejects.toMatchObject({ kind, code });
  });

  it('classifies a quota-related 403 as rate limited', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => new Response(
      input.toString().includes('oauth2.googleapis.com')
        ? JSON.stringify({ access_token: 'access-1', expires_in: 3600 })
        : JSON.stringify({ error: { errors: [{ reason: 'rateLimitExceeded' }] } }),
      { status: input.toString().includes('oauth2.googleapis.com') ? 200 : 403 },
    ));
    const provider = new GmailEmailProvider({
      from: 'Remindly <remindly@example.com>',
      oauth: new GmailOAuthClient({ clientId: 'client', clientSecret: 'secret', refreshToken: 'refresh' }),
    });

    await expect(provider.send(email)).rejects.toMatchObject({ kind: 'rate_limited', code: 'gmail_rate_limited' });
  });
});
