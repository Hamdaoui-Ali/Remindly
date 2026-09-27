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

function resendFailureCode(error: NonNullable<Extract<CreateEmailResponse, { error: unknown }>['error']>): string {
  if (typeof error.name === 'string' && /^[a-z0-9_]+$/.test(error.name)) {
    return `resend_${error.name}`;
  }
  if (error.statusCode === 401) return 'resend_unauthorized';
  if (error.statusCode === 403) return 'resend_forbidden';
  if (error.statusCode === 429) return 'resend_rate_limited';
  if (typeof error.statusCode === 'number' && error.statusCode >= 500) return 'resend_5xx';
  return 'resend_rejected';
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

    if (response.error) {
      throw new EmailDeliveryError('definite_failure', resendFailureCode(response.error));
    }
    if (!response.data) throw new EmailDeliveryError('unknown_outcome');

    return { providerMessageId: response.data.id };
  }
}
