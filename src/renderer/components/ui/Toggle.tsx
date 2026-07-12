/** Toggle — switch over a native checkbox input. Phase 1 · M5a. */
import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

export interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: ReactNode;
}

export const Toggle = forwardRef<HTMLInputElement, ToggleProps>(function Toggle(
  { label, className = '', disabled, ...rest },
  ref,
) {
  return (
    <label className={['ui-toggle', disabled ? 'ui-toggle--disabled' : '', className].filter(Boolean).join(' ')}>
      <input ref={ref} type="checkbox" role="switch" disabled={disabled} {...rest} />
      <span className="ui-toggle__track" aria-hidden="true">
        <span className="ui-toggle__thumb" />
      </span>
      {label != null && <span>{label}</span>}
    </label>
  );
});

export default Toggle;
