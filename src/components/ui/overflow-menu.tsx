'use client';

import { MoreVertical } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export function OverflowMenu({ children, label = 'Reminder actions' }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  return (
    <div className="overflow-menu" ref={menuRef}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        className="icon-button"
        onClick={() => setOpen((current) => !current)}
      >
        <MoreVertical aria-hidden="true" size={20} strokeWidth={1.75} />
      </button>
      {open ? <div role="menu" className="overflow-menu__content">{children}</div> : null}
    </div>
  );
}
