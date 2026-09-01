import type { ReactNode } from 'react';

export function AuthShell({ children, description, footer, labelledBy, title }: {
  children: ReactNode;
  description: string;
  footer: ReactNode;
  labelledBy: string;
  title: string;
}) {
  return (
    <main className="login-shell" aria-labelledby={labelledBy}>
      <section className="login-panel">
        <p className="wordmark">Remindly</p>
        <h1 id={labelledBy}>{title}</h1>
        <p>{description}</p>
        {children}
        {footer}
      </section>
    </main>
  );
}
