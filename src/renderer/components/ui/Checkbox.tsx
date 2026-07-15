/** Checkbox — custom box over a native input (keeps a11y + keyboard). Phase 1 · M5a. */
import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, className = '', disabled, ...rest },
  ref,
) {
  return (
    <label className={['ui-check', disabled ? 'ui-check--disabled' : '', className].filter(Boolean).join(' ')}>
      <input ref={ref} type="checkbox" disabled={disabled} {...rest} />
      <span className="ui-check__box" aria-hidden="true">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12l5 5L20 6" />
        </svg>
      </span>
      {label != null && <span>{label}</span>}
    </label>
  );
});

export default Checkbox;
