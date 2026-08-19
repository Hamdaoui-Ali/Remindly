import { forwardRef, type ButtonHTMLAttributes } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  pending?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  children,
  className = '',
  disabled,
  pending = false,
  type = 'button',
  variant = 'primary',
  ...props
}, ref) {
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={`button button--${variant} ${className}`.trim()}
    >
      {pending ? 'Working…' : children}
    </button>
  );
});
