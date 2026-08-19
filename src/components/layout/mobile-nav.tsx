'use client';

import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { SidebarNav } from './sidebar-nav';

export function MobileNav({ activePath, ownerEmail }: { activePath: string; ownerEmail: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="mobile-nav">
        <Link className="wordmark" href="/">Remindly</Link>
        <button type="button" className="icon-button" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(true)}>
          <Menu aria-hidden="true" size={24} strokeWidth={1.75} />
        </button>
      </header>
      {open ? (
        <div className="mobile-nav__overlay">
          <button type="button" className="mobile-nav__backdrop" aria-label="Close navigation" onClick={() => setOpen(false)} />
          <div className="mobile-nav__panel">
            <button type="button" className="icon-button mobile-nav__close" aria-label="Close navigation" onClick={() => setOpen(false)}>
              <X aria-hidden="true" size={24} strokeWidth={1.75} />
            </button>
            <SidebarNav activePath={activePath} ownerEmail={ownerEmail} />
          </div>
        </div>
      ) : null}
    </>
  );
}
