/** Slider — styled native range input. Phase 1 · M5a. */
import { forwardRef, type InputHTMLAttributes } from 'react';

/**
 * A range input carries a role and a value natively but no name, so a screen
 * reader announces a bare "slider" unless the caller supplies one. An adjacent
 * `<span>` label is not read — only `aria-label`/`aria-labelledby` is — so one
 * of the two is required rather than optional.
 */
export type SliderProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> &
  ({ 'aria-label': string } | { 'aria-labelledby': string });

export const Slider = forwardRef<HTMLInputElement, SliderProps>(function Slider(
  { className = '', ...rest },
  ref,
) {
  return <input ref={ref} type="range" className={['ui-slider', className].filter(Boolean).join(' ')} {...rest} />;
});

export default Slider;
