/** IconButton — icon-only button with a required accessible label. Phase 1 · M5a. */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name — required since there is no visible text. */
  label: string;
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

const SIZE = { sm: 'ui-icon-btn--sm', md: '', lg: 'ui-icon-btn--lg' } as const;

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = 'md', className = '', type = 'button', children, ...rest },
  ref,
) {
  const cls = ['ui-icon-btn', 'ui-focusable', SIZE[size], className].filter(Boolean).join(' ');
  return (
    <button ref={ref} type={type} className={cls} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
});

export default IconButton;
