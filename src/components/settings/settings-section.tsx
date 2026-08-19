import type { ReactNode } from 'react';

export function SettingsSection({ children, description, title }: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section className="settings-section">
      <div className="settings-section__intro">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="settings-section__content">{children}</div>
    </section>
  );
}
