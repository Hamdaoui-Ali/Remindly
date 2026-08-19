'use client';

import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';

type DrawerProps = {
  children: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  open: boolean;
  title: string;
};

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function Drawer({ children, initialFocusRef, onClose, open, title }: DrawerProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const initialTarget = dialog?.querySelector<HTMLElement>(focusableSelector);
    initialTarget?.focus();

    const restoreFocus = () => initialFocusRef?.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        restoreFocus();
        return;
      }

      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [initialFocusRef, onClose, open]);

  if (!open) return null;

  return (
    <div className="drawer-layer">
      <button type="button" className="drawer-backdrop" aria-label="Close drawer" onClick={onClose} />
      <section ref={dialogRef} className="drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="drawer__header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-button" aria-label={`Close ${title}`} onClick={onClose}>
            <X aria-hidden="true" size={24} strokeWidth={1.75} />
          </button>
        </header>
        <div className="drawer__content">{children}</div>
      </section>
    </div>
  );
}
