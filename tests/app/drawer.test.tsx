import { useRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { Drawer } from '@/components/ui/drawer';

it('traps focus and restores it after Escape', async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();

  function Fixture() {
    const triggerRef = useRef<HTMLButtonElement>(null);

    return (
      <>
        <button ref={triggerRef}>Open</button>
        <Drawer
          open
          title="Add reminder"
          onClose={onClose}
          initialFocusRef={triggerRef}
        >
          <button>Save</button>
        </Drawer>
      </>
    );
  }

  render(<Fixture />);
  const trigger = screen.getByRole('button', { name: 'Open' });

  await user.keyboard('{Escape}');

  expect(onClose).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(trigger);
});
