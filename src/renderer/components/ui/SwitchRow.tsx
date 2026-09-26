/**
 * SwitchRow — the Windows 11 setting row: a name and one line of description on
 * the left, an on/off switch on the right, and the whole row is the hit target.
 *
 * It replaces rows that put a native checkbox after a `<strong>` and a `<small>`
 * run together inline (the class they used had no stylesheet at all). The input
 * is a real checkbox with `role="switch"`, so keyboard, form and screen-reader
 * behaviour are the element's own; `.ui-switch` only paints it.
 */
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';

export interface SwitchRowProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'title'> {
  title: ReactNode;
  description?: ReactNode;
  /** Class for the row (the label element). */
  rowClassName?: string;
}

export const SwitchRow = forwardRef<HTMLInputElement, SwitchRowProps>(function SwitchRow(
  { title, description, rowClassName = '', className = '', disabled, ...rest },
  ref,
) {
  const descId = useId();
  return (
    <label className={['ui-switch-row', disabled ? 'is-disabled' : '', rowClassName].filter(Boolean).join(' ')}>
      <span className="ui-switch-row__text">
        <span className="ui-switch-row__title">{title}</span>
        {description != null && (
          <span id={descId} className="ui-switch-row__desc">
            {description}
          </span>
        )}
      </span>
      <input
        ref={ref}
        type="checkbox"
        role="switch"
        className={['ui-switch', className].filter(Boolean).join(' ')}
        disabled={disabled}
        aria-describedby={description != null ? descId : undefined}
        {...rest}
      />
    </label>
  );
});

export default SwitchRow;
