import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MobileNav } from '@/components/layout/mobile-nav';

it('treats the mobile navigation as a keyboard modal and restores the trigger', async () => {
  const user = userEvent.setup();
  render(<MobileNav activePath="/reminders" ownerEmail="owner@example.com" />);
  const trigger = screen.getByRole('button', { name: 'Open navigation' });

  await user.click(trigger);

  const dialog = screen.getByRole('dialog', { name: 'Navigation' });
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(within(dialog).getByRole('button', { name: 'Close navigation' })).toHaveFocus();

  await user.tab({ shift: true });
  expect(within(dialog).getByRole('link', { name: 'Settings' })).toHaveFocus();

  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog', { name: 'Navigation' })).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});
