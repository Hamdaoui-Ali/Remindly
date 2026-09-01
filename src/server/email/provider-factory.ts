import { GmailEmailProvider } from './gmail-provider';
import { GmailOAuthClient } from './gmail-oauth';
import { ResendEmailProvider } from './resend-provider';
import type { EmailProvider } from './provider';

export interface EmailProviderConfig {
  emailProvider: 'gmail' | 'resend';
  gmailClientId?: string;
  gmailClientSecret?: string;
  gmailRefreshToken?: string;
  gmailSenderEmail?: string;
  gmailSenderName: string;
  gmailRequestTimeoutMs: number;
  resendApiKey: string;
  resendFrom: string;
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required for Gmail delivery`);
  return value;
}

export function createEmailProvider(config: EmailProviderConfig): EmailProvider {
  if (config.emailProvider === 'resend') {
    return new ResendEmailProvider({ apiKey: config.resendApiKey, from: config.resendFrom });
  }
  return new GmailEmailProvider({
    from: `${config.gmailSenderName} <${required(config.gmailSenderEmail, 'GMAIL_SENDER_EMAIL')}>`,
    oauth: new GmailOAuthClient({
      clientId: required(config.gmailClientId, 'GMAIL_CLIENT_ID'),
      clientSecret: required(config.gmailClientSecret, 'GMAIL_CLIENT_SECRET'),
      refreshToken: required(config.gmailRefreshToken, 'GMAIL_REFRESH_TOKEN'),
    }),
    requestTimeoutMs: config.gmailRequestTimeoutMs,
  });
}
