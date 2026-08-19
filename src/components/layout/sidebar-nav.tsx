import { Bell, Grid2X2, Settings, UserRound } from 'lucide-react';
import Link from 'next/link';

const items = [
  { href: '/', icon: Grid2X2, label: 'Dashboard' },
  { href: '/reminders', icon: Bell, label: 'Reminders' },
  { href: '/settings', icon: Settings, label: 'Settings' },
];

export function SidebarNav({ activePath, ownerEmail }: { activePath: string; ownerEmail: string }) {
  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <Link className="wordmark sidebar__wordmark" href="/">Remindly</Link>
      <nav className="sidebar__nav" aria-label="Remindly sections">
        {items.map(({ href, icon: Icon, label }) => (
          <Link key={href} className="sidebar__link" href={href} aria-current={activePath === href ? 'page' : undefined}>
            <Icon aria-hidden="true" size={22} strokeWidth={1.75} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
      <div className="sidebar__owner">
        <UserRound aria-hidden="true" size={26} strokeWidth={1.75} />
        <span><strong>Private workspace</strong><small>{ownerEmail}</small></span>
      </div>
    </aside>
  );
}
