import {
  EmailDeliveryError,
  type EmailProvider,
  type SendEmailInput,
  type SendEmailResult,
} from './provider';
import { classifyGmailResponse, gmailTransportError, GmailDeliveryError } from './errors';
import { GmailOAuthClient } from './gmail-oauth';
import { buildMimeMessage } from './mime';

export interface GmailEmailProviderOptions {
  from: string;
  oauth: GmailOAuthClient;
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class GmailEmailProvider implements EmailProvider {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: GmailEmailProviderOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const raw = buildMimeMessage({ ...input, from: this.options.from });
    let accessToken: string;
    try {
      accessToken = await this.options.oauth.getAccessToken();
    } catch (error) {
      if (error instanceof EmailDeliveryError) throw error;
      throw gmailTransportError();
    }

    let response: Response;
    try {
      response = await this.fetchImpl('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ raw }),
        signal: AbortSignal.timeout(this.options.requestTimeoutMs ?? 10_000),
      });
    } catch {
      throw gmailTransportError();
    }

    const body = await response.json().catch(() => ({})) as { id?: string };
    if (!response.ok) throw classifyGmailResponse(response.status, body);
    if (!body.id) throw new GmailDeliveryError('unknown_outcome', 'gmail_missing_message_id', 'unknown_outcome');
    return { providerMessageId: body.id };
  }
}
