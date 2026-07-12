/** Input + Field wrapper. Phase 1 · M5a. */
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Optional label + hint rendered as a <Field> wrapper. */
  label?: ReactNode;
  hint?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, className = '', id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const input = (
    <input ref={ref} id={inputId} className={['ui-input', className].filter(Boolean).join(' ')} {...rest} />
  );
  if (label == null && hint == null) return input;
  return (
    <div className="ui-field">
      {label != null && (
        <label className="ui-field__label" htmlFor={inputId}>
          {label}
        </label>
      )}
      {input}
      {hint != null && <span className="ui-field__hint">{hint}</span>}
    </div>
  );
});

export default Input;
