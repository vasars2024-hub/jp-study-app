/** Button — token/material-driven, accessible. Phase 1 · M5a. */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type ButtonVariant = 'default' | 'primary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const VARIANT: Record<ButtonVariant, string> = {
  default: '',
  primary: 'ui-btn--primary',
  danger: 'ui-btn--danger',
  ghost: 'ui-btn--ghost',
};
const SIZE: Record<ButtonSize, string> = { sm: 'ui-btn--sm', md: '', lg: 'ui-btn--lg' };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'default', size = 'md', block, leftIcon, rightIcon, className = '', type = 'button', children, ...rest },
  ref,
) {
  const cls = ['ui-btn', 'ui-focusable', VARIANT[variant], SIZE[size], block ? 'ui-btn--block' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button ref={ref} type={type} className={cls} {...rest}>
      {leftIcon}
      {children}
      {rightIcon}
    </button>
  );
});

export default Button;
