/** Tooltip — CSS-driven, zoom-safe (no coordinate math). Phase 1 · M5a. */
import { useId, type ReactNode } from 'react';

export interface TooltipProps {
  content: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  children: ReactNode;
  className?: string;
}

export function Tooltip({ content, side = 'top', children, className = '' }: TooltipProps) {
  const id = useId();
  return (
    <span className={['ui-tooltip-wrap', `ui-tooltip-wrap--${side}`, className].filter(Boolean).join(' ')}>
      <span aria-describedby={id}>{children}</span>
      <span className="ui-tooltip" role="tooltip" id={id}>
        {content}
      </span>
    </span>
  );
}

export default Tooltip;
