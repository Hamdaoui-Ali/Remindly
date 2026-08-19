'use client';

import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';

import { SidebarNav } from './sidebar-nav';
import { useModalFocus } from '../ui/use-modal-focus';

export function MobileNav({ activePath, ownerEmail }: { activePath: string; ownerEmail: string }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useModalFocus({
    containerRef: panelRef,
    initialFocusRef: triggerRef,
    onClose: () => setOpen(false),
    open,
  });

  return (
    <>
      <header className="mobile-nav">
        <Link className="wordmark" href="/">Remindly</Link>
        <button ref={triggerRef} type="button" className="icon-button" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(true)}>
          <Menu aria-hidden="true" size={24} strokeWidth={1.75} />
        </button>
      </header>
      {open ? (
        <div className="mobile-nav__overlay">
          <button type="button" className="mobile-nav__backdrop" aria-label="Close navigation" onClick={close} />
          <section ref={panelRef} className="mobile-nav__panel" role="dialog" aria-modal="true" aria-label="Navigation" tabIndex={-1}>
            <button type="button" className="icon-button mobile-nav__close" aria-label="Close navigation" onClick={close}>
              <X aria-hidden="true" size={24} strokeWidth={1.75} />
            </button>
            <SidebarNav activePath={activePath} ownerEmail={ownerEmail} />
          </section>
        </div>
      ) : null}
    </>
  );
}
