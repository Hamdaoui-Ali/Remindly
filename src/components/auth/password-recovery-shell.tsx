import type { ReactNode } from 'react';
import Link from 'next/link';
import { AuthShell } from './auth-shell';

export function PasswordRecoveryShell({ children, description, labelledBy, title }: {
  children: ReactNode;
  description: string;
  labelledBy: string;
  title: string;
}) {
  return (
    <AuthShell
      title={title}
      description={description}
      labelledBy={labelledBy}
      footer={<p><Link href="/login">Back to sign in</Link></p>}
    >
      {children}
    </AuthShell>
  );
}
