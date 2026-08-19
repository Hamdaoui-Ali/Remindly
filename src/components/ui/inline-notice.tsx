import type { ReactNode } from 'react';

type InlineNoticeProps = {
  children: ReactNode;
  tone?: 'error' | 'success' | 'info';
};

export function InlineNotice({ children, tone = 'info' }: InlineNoticeProps) {
  return <p className={`inline-notice inline-notice--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</p>;
}
