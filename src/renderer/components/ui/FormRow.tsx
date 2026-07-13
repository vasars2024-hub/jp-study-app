/**
 * FormRow — compact horizontal label/control row (desktop-software density,
 * label left, control right). Phase 4 · M1. Complements the vertical
 * `.ui-field` from Phase 1 rather than replacing it.
 */
import type { ReactNode } from 'react';

export interface FormRowProps {
  label: ReactNode;
  /** Associates the label with the control (pass the control's id). */
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function FormRow({ label, htmlFor, hint, children, className = '' }: FormRowProps) {
  return (
    <div className={['ui-form-row', className].filter(Boolean).join(' ')}>
      <label className="ui-form-row__label" htmlFor={htmlFor}>
        {label}
      </label>
      <div className="ui-form-row__control">
        {children}
        {hint != null && <div className="ui-form-row__hint">{hint}</div>}
      </div>
    </div>
  );
}

export default FormRow;
