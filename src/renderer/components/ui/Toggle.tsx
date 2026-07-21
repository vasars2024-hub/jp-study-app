/** Toggle — switch over a native checkbox input. Phase 1 · M5a. */
import { forwardRef, type ChangeEvent, type InputHTMLAttributes, type ReactNode } from 'react';

export interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: ReactNode;
}

export const Toggle = forwardRef<HTMLInputElement, ToggleProps>(function Toggle(
  { label, className = '', disabled, onChange, ...rest },
  ref,
) {
  // WIRED ARCHIVE DIP switches clack (bespoke §8) — the cue name only exists
  // in the wired pack, so this is a no-op under every other theme.
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (document.documentElement.getAttribute('data-materials') === 'wired') {
      window.dispatchEvent(new CustomEvent('wired:switch-clack'));
    }
    onChange?.(e);
  };
  return (
    <label className={['ui-toggle', disabled ? 'ui-toggle--disabled' : '', className].filter(Boolean).join(' ')}>
      <input ref={ref} type="checkbox" role="switch" disabled={disabled} onChange={handleChange} {...rest} />
      <span className="ui-toggle__track" aria-hidden="true">
        <span className="ui-toggle__thumb" />
      </span>
      {label != null && <span>{label}</span>}
    </label>
  );
});

export default Toggle;
