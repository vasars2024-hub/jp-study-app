/** Select — native select, styled. Phase 1 · M5a. */
import { forwardRef, type SelectHTMLAttributes } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options?: SelectOption[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, className = '', children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={['ui-select', 'ui-focusable', className].filter(Boolean).join(' ')}
      {...rest}
    >
      {options
        ? options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))
        : children}
    </select>
  );
});

export default Select;
