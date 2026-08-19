import { AppShell } from '@/components/layout/app-shell';
import { requireOwner } from '@/server/auth/require-owner';

export default async function ProtectedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const owner = await requireOwner();

  return <AppShell ownerEmail={owner.email}>{children}</AppShell>;
}
