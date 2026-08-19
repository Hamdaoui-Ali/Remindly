'use client';

import { MoreVertical } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export function OverflowMenu({ children, label = 'Reminder actions' }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    popoverRef.current?.querySelector<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  return (
    <div className="overflow-menu">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="icon-button"
        onClick={() => setOpen((current) => !current)}
      >
        <MoreVertical aria-hidden="true" size={20} strokeWidth={1.75} />
      </button>
      {open ? <div ref={popoverRef} role="dialog" aria-label={label} className="overflow-menu__content" onClick={close}>{children}</div> : null}
    </div>
  );
}
