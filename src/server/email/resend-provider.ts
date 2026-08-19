import {
  Resend,
  type CreateEmailOptions,
  type CreateEmailRequestOptions,
  type CreateEmailResponse,
} from 'resend';
import type { EmailProvider, SendEmailInput, SendEmailResult } from './provider';

export interface ResendClient {
  emails: {
    send(
      payload: CreateEmailOptions,
      options?: CreateEmailRequestOptions,
    ): Promise<CreateEmailResponse>;
  };
}

export interface ResendEmailProviderOptions {
  apiKey: string;
  from: string;
  client?: ResendClient;
}

export class ResendEmailProvider implements EmailProvider {
  private readonly client: ResendClient;

  constructor(private readonly options: ResendEmailProviderOptions) {
    this.client = options.client ?? new Resend(options.apiKey);
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const response = await this.client.emails.send({
      from: this.options.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    }, { idempotencyKey: input.idempotencyKey });

    if (response.error || !response.data) {
      throw new Error('Resend email request failed');
    }

    return { providerMessageId: response.data.id };
  }
}
