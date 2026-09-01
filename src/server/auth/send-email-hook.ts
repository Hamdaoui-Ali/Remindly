import { z } from 'zod';
import type { SendEmailInput } from '@/server/email/provider';

const actionSchema = z.enum(['signup', 'recovery', 'magiclink', 'invite', 'email_change']);
const payloadSchema = z.object({
  user: z.object({ email: z.string().email(), new_email: z.string().email().optional() }),
  email_data: z.object({
    token: z.string().min(1).optional(),
    token_hash: z.string().min(1).optional(),
    token_new: z.string().min(1).optional(),
    token_hash_new: z.string().min(1).optional(),
    redirect_to: z.string().url().optional(),
    site_url: z.string().url().optional(),
    email_action_type: actionSchema,
  }),
});

export type AuthHookPayload = z.infer<typeof payloadSchema>;

export function parseAuthHookPayload(input: unknown): AuthHookPayload {
  const payload = payloadSchema.parse(input);
  const { email_action_type: action } = payload.email_data;
  const { token, token_hash, token_new: tokenNew, token_hash_new: tokenHashNew } = payload.email_data;
  if (action !== 'email_change' && (!token_hash || !token)) {
    throw new Error('Auth email token fields are incomplete');
  }
  if (action === 'email_change' && !payload.user.new_email && (!tokenHashNew || !tokenNew)) {
    throw new Error('Auth email change token fields are incomplete');
  }
  if (action === 'email_change' && payload.user.new_email && (!tokenNew || !token_hash)) {
    throw new Error('Auth email change token fields are incomplete');
  }
  return payload;
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function safeRedirect(redirectTo: string | undefined, appUrl: string): string {
  const base = new URL(appUrl);
  const redirect = redirectTo ? new URL(redirectTo) : base;
  if (redirect.origin !== base.origin) throw new Error('Auth redirect is not allowed');
  return redirect.toString();
}

function emailChangeTokens(payload: AuthHookPayload): { recipient: string; token: string; tokenHash: string } {
  const { email_data: data, user } = payload;
  if (user.new_email) {
    return { recipient: user.new_email, token: data.token_new!, tokenHash: data.token_hash! };
  }
  return { recipient: user.email, token: data.token_new!, tokenHash: data.token_hash_new! };
}

export function buildAuthEmail(payload: AuthHookPayload, appUrl: string): SendEmailInput {
  const action = payload.email_data.email_action_type;
  const isNewEmail = action === 'email_change' && Boolean(payload.user.new_email);
  const emailChange = action === 'email_change' ? emailChangeTokens(payload) : null;
  const recipient = emailChange?.recipient ?? payload.user.email;
  const token = emailChange?.token ?? payload.email_data.token!;
  const tokenHash = emailChange?.tokenHash ?? payload.email_data.token_hash!;
  const redirect = safeRedirect(payload.email_data.redirect_to, appUrl);
  const confirmation = new URL('/auth/confirm', appUrl);
  confirmation.searchParams.set(isNewEmail ? 'token' : 'token_hash', isNewEmail ? token : tokenHash);
  confirmation.searchParams.set('type', action);
  confirmation.searchParams.set('next', redirect);
  const link = confirmation.toString();
  const labels: Record<typeof action, string> = {
    signup: 'Confirm your Remindly account',
    recovery: 'Reset your Remindly password',
    magiclink: 'Sign in to Remindly',
    invite: 'You are invited to Remindly',
    email_change: 'Confirm your Remindly email change',
  };
  const subject = labels[action];
  const text = `${subject}\n\nOpen this link to continue: ${link}`;
  const html = `<h1>${escapeHtml(subject)}</h1><p><a href="${escapeHtml(link)}">Continue in Remindly</a></p>`;
  return { to: recipient, subject, text, html, idempotencyKey: `auth-${action}-${tokenHash}` };
}
