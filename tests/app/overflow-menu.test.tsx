import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { OverflowMenu } from '@/components/ui/overflow-menu';

it('opens an ordinary popover, moves focus into it, and restores the trigger on Escape', async () => {
  const user = userEvent.setup();
  render(<OverflowMenu><button>Mark done</button><button>Renew</button></OverflowMenu>);
  const trigger = screen.getByRole('button', { name: 'Reminder actions' });

  await user.click(trigger);

  expect(screen.getByRole('group', { name: 'Reminder actions' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Mark done' })).toHaveFocus();

  await user.keyboard('{Escape}');
  expect(screen.queryByRole('group', { name: 'Reminder actions' })).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});
