'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { MobileNav } from './mobile-nav';
import { SidebarNav } from './sidebar-nav';

export function AppShell({ activePath, children, ownerEmail }: { activePath?: string; children: ReactNode; ownerEmail: string }) {
  const pathname = usePathname();
  const currentPath = activePath ?? pathname ?? '/';

  return (
    <div className="app-shell">
      <SidebarNav activePath={currentPath} ownerEmail={ownerEmail} />
      <MobileNav activePath={currentPath} ownerEmail={ownerEmail} />
      <div className="app-shell__content">{children}</div>
    </div>
  );
}
