import { describe, expect, it } from 'vitest';
import { GmailEmailProvider } from '@/server/email/gmail-provider';
import { ResendEmailProvider } from '@/server/email/resend-provider';
import { createEmailProvider } from '@/server/email/provider-factory';

const common = {
  gmailClientId: 'client',
  gmailClientSecret: 'secret',
  gmailRefreshToken: 'refresh',
  gmailSenderEmail: 'remindly@example.com',
  gmailSenderName: 'Remindly',
  gmailRequestTimeoutMs: 10_000,
  resendApiKey: 're_test',
  resendFrom: 'Remindly <remindly@example.com>',
};

describe('createEmailProvider', () => {
  it('creates Gmail from complete Gmail configuration', () => {
    expect(createEmailProvider({ ...common, emailProvider: 'gmail' })).toBeInstanceOf(GmailEmailProvider);
  });

  it('creates Resend for the compatibility provider', () => {
    expect(createEmailProvider({ ...common, emailProvider: 'resend' })).toBeInstanceOf(ResendEmailProvider);
  });
});
