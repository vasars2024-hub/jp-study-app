/** Slider — styled native range input. Phase 1 · M5a. */
import { forwardRef, type InputHTMLAttributes } from 'react';

export type SliderProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export const Slider = forwardRef<HTMLInputElement, SliderProps>(function Slider(
  { className = '', ...rest },
  ref,
) {
  return <input ref={ref} type="range" className={['ui-slider', className].filter(Boolean).join(' ')} {...rest} />;
});

export default Slider;
