import {
  Resend,
  type CreateEmailOptions,
  type CreateEmailRequestOptions,
  type CreateEmailResponse,
} from 'resend';
import {
  EmailDeliveryError,
  type EmailProvider,
  type SendEmailInput,
  type SendEmailResult,
} from './provider';

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
    let response: CreateEmailResponse;
    try {
      response = await this.client.emails.send({
        from: this.options.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }, { idempotencyKey: input.idempotencyKey });
    } catch {
      throw new EmailDeliveryError('unknown_outcome');
    }

    if (response.error) throw new EmailDeliveryError('definite_failure');
    if (!response.data) throw new EmailDeliveryError('unknown_outcome');

    return { providerMessageId: response.data.id };
  }
}
