import { GmailDeliveryError } from './errors';
import { isValidEmail } from '@/lib/validation/auth';

export interface MimeInput {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

function assertSafeHeader(value: string, label: string): void {
  if (/[\r\n]/.test(value)) {
    throw new GmailDeliveryError('permanent', `gmail_invalid_${label}`, 'definite_failure');
  }
}

function assertEmail(value: string): void {
  if (!isValidEmail(value)) {
    throw new GmailDeliveryError('permanent', 'gmail_invalid_message', 'definite_failure');
  }
}

export function buildMimeMessage(input: MimeInput): string {
  assertSafeHeader(input.from, 'from');
  assertSafeHeader(input.to, 'to');
  assertSafeHeader(input.subject, 'subject');
  assertEmail(input.to);
  if (input.subject.length > 998) {
    throw new GmailDeliveryError('permanent', 'gmail_invalid_subject', 'definite_failure');
  }

  const boundary = `remindly-${crypto.randomUUID()}`;
  const message = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    input.text,
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    input.html,
    `--${boundary}--`,
    '',
  ].join('\r\n');

  return Buffer.from(message, 'utf8').toString('base64url');
}
