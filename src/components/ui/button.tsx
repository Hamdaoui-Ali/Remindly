import type { ButtonHTMLAttributes } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  pending?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
};

export function Button({
  children,
  className = '',
  disabled,
  pending = false,
  type = 'button',
  variant = 'primary',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={`button button--${variant} ${className}`.trim()}
    >
      {pending ? 'Working…' : children}
    </button>
  );
}
