import { describe, expect, it } from 'vitest';
import { buildAuthEmail, parseAuthHookPayload } from '@/server/auth/send-email-hook';

const base = {
  user: { email: 'person@example.com' },
  email_data: {
    token: 'token-1',
    token_hash: 'hash-1',
    redirect_to: 'http://localhost:3000/reminders',
    site_url: 'http://localhost:3000',
    email_action_type: 'signup',
  },
};

describe('Supabase Auth email hook payloads', () => {
  it('maps signup to a token-hash confirmation link', () => {
    const email = buildAuthEmail(parseAuthHookPayload(base), 'http://localhost:3000');

    expect(email.to).toBe('person@example.com');
    expect(email.subject).toContain('Confirm');
    expect(email.html).toContain('token_hash=hash-1');
    expect(email.html).toContain('type=signup');
  });

  it('uses the new address and new token for email change', () => {
    const email = buildAuthEmail(parseAuthHookPayload({
      user: { email: 'old@example.com', new_email: 'new@example.com' },
      email_data: {
        token_new: 'token-new',
        token_hash: 'hash-new',
        email_action_type: 'email_change',
        site_url: 'http://localhost:3000',
      },
    }), 'http://localhost:3000');

    expect(email.to).toBe('new@example.com');
    expect(email.html).toContain('token=token-new');
    expect(email.html).toContain('type=email_change');
  });

  it('uses the new token hash for email change sent to the current address', () => {
    const email = buildAuthEmail(parseAuthHookPayload({
      user: { email: 'old@example.com' },
      email_data: {
        token_new: 'token-current',
        token_hash_new: 'hash-current',
        email_action_type: 'email_change',
      },
    }), 'http://localhost:3000');

    expect(email.to).toBe('old@example.com');
    expect(email.html).toContain('token_hash=hash-current');
    expect(email.html).toContain('type=email_change');
    expect(email.html).not.toContain('undefined');
  });

  it('rejects unsupported actions and external redirects', () => {
    expect(() => parseAuthHookPayload({ ...base, email_data: { ...base.email_data, email_action_type: 'unknown' } })).toThrow();
    expect(() => buildAuthEmail(parseAuthHookPayload(base), 'https://remindly.example.com')).toThrow();
  });
});
