import type { InputHTMLAttributes, RefObject } from 'react';

type AuthFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  inputRef?: RefObject<HTMLInputElement | null>;
  label: string;
};

export function AuthField({ inputRef, label, ...inputProps }: AuthFieldProps) {
  return (
    <div className="login-field">
      <label htmlFor={inputProps.id}>{label}</label>
      <input ref={inputRef} {...inputProps} />
    </div>
  );
}
