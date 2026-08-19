import { useRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { Drawer } from '@/components/ui/drawer';

function Fixture({ onClose = vi.fn() }: { onClose?: () => void }) {
  const [open, setOpen] = useState(true);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = () => {
    onClose();
    setOpen(false);
  };

  return (
    <>
      <button ref={triggerRef}>Open</button>
      <Drawer open={open} title="Add reminder" onClose={close} initialFocusRef={triggerRef}>
        <button>Save</button>
      </Drawer>
    </>
  );
}

it('traps focus and restores it after Escape', async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();

  render(<Fixture onClose={onClose} />);
  const trigger = screen.getByRole('button', { name: 'Open' });

  await user.keyboard('{Escape}');

  expect(onClose).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(trigger);
});

it('keeps Tab focus in the drawer', async () => {
  const user = userEvent.setup();
  render(<Fixture />);

  expect(screen.getByRole('button', { name: 'Close Add reminder' })).toHaveFocus();
  await user.tab({ shift: true });
  expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus();
});

it.each(['Close Add reminder', 'Close drawer'] as const)('restores trigger focus after %s closes the drawer', async (label) => {
  const user = userEvent.setup();
  render(<Fixture />);
  const trigger = screen.getByRole('button', { name: 'Open' });

  await user.click(screen.getByRole('button', { name: label }));

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(document.activeElement).toBe(trigger);
});
