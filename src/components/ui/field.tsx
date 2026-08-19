import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';

type FieldProps = {
  children: ReactNode;
  description?: string;
  error?: string;
  htmlFor: string;
  label: string;
};

export function Field({ children, description, error, htmlFor, label }: FieldProps) {
  const descriptionId = description ? `${htmlFor}-description` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined;
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<{ 'aria-describedby'?: string; 'aria-invalid'?: boolean; id?: string }>, {
        id: htmlFor,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
      })
    : children;

  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {control}
      {description ? <p id={descriptionId} className="field__description">{description}</p> : null}
      {error ? <p id={errorId} className="field__error" role="alert">{error}</p> : null}
    </div>
  );
}

export function fieldDescribedBy(inputId: string, description?: string, error?: string) {
  return [description ? `${inputId}-description` : null, error ? `${inputId}-error` : null]
    .filter(Boolean)
    .join(' ') || undefined;
}
