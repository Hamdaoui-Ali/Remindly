import type { ReactNode } from 'react';

export function PageHeader({ action, description, title }: { action?: ReactNode; description?: string; title: string }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="page-header__action">{action}</div> : null}
    </header>
  );
}
