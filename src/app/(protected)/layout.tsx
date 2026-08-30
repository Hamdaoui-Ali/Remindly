import { AppShell } from '@/components/layout/app-shell';
import { requireUser } from '@/server/auth/require-user';

export default async function ProtectedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();

  return <AppShell ownerEmail={user.email}><div className="protected-route">{children}</div></AppShell>;
}
