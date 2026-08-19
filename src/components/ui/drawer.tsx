'use client';

import { X } from 'lucide-react';
import { useId, useRef, type ReactNode, type RefObject } from 'react';

import { useModalFocus } from './use-modal-focus';

type DrawerProps = {
  children: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  open: boolean;
  title: string;
};

export function Drawer({ children, initialFocusRef, onClose, open, title }: DrawerProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const close = useModalFocus({ containerRef: dialogRef, initialFocusRef, onClose, open });

  if (!open) return null;

  return (
    <div className="drawer-layer">
      <button type="button" className="drawer-backdrop" aria-label="Close drawer" onClick={close} />
      <section ref={dialogRef} className="drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="drawer__header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-button" aria-label={`Close ${title}`} onClick={close}>
            <X aria-hidden="true" size={24} strokeWidth={1.75} />
          </button>
        </header>
        <div className="drawer__content">{children}</div>
      </section>
    </div>
  );
}
