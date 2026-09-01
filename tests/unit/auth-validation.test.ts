import { isValidEmail } from '@/lib/validation/auth';

describe('isValidEmail', () => {
  it('accepts a simple email address', () => {
    expect(isValidEmail('owner@example.com')).toBe(true);
  });

  it('rejects malformed or whitespace-containing addresses', () => {
    expect(isValidEmail('owner@example')).toBe(false);
    expect(isValidEmail('owner@@example.com')).toBe(false);
    expect(isValidEmail('owner @example.com')).toBe(false);
    expect(isValidEmail(' owner@example.com')).toBe(false);
  });
});
