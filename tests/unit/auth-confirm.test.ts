import { describe, expect, it } from 'vitest';
import { confirmationRedirect, confirmationType } from '@/server/auth/confirm';

describe('Supabase confirmation route helpers', () => {
  it('accepts only supported action-specific verification types', () => {
    expect(confirmationType('signup')).toBe('signup');
    expect(confirmationType('recovery')).toBe('recovery');
    expect(confirmationType('email_change')).toBe('email_change');
    expect(confirmationType('email')).toBeNull();
  });

  it('keeps redirects on the application origin', () => {
    expect(confirmationRedirect('http://localhost:3000/reminders', 'http://localhost:3000')).toBe('/reminders');
    expect(confirmationRedirect('/settings', 'http://localhost:3000')).toBe('/settings');
    expect(confirmationRedirect('https://evil.example/reset', 'http://localhost:3000')).toBe('/');
  });
});
