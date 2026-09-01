import { describe, expect, it } from 'vitest';

import { requiresLegacySettings } from '@/server/notifications/processor';

describe('processor settings boundary', () => {
  it('does not require singleton settings when every claim has an alert relation', () => {
    expect(requiresLegacySettings([
      { reminderAlertId: 'alert-1' },
      { reminderAlertId: 'alert-2' },
    ])).toBe(false);
  });

  it('requires singleton settings when a legacy claim has no alert relation', () => {
    expect(requiresLegacySettings([
      { reminderAlertId: 'alert-1' },
      { reminderAlertId: null },
    ])).toBe(true);
  });
});
