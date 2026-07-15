/** Card / GlassCard / Panel — token/material-driven surfaces. Phase 1 · M5a. */
import { forwardRef, type HTMLAttributes } from 'react';

function surface(base: string) {
  return forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Surface(
    { className = '', ...rest },
    ref,
  ) {
    return <div ref={ref} className={[base, className].filter(Boolean).join(' ')} {...rest} />;
  });
}

/** Opaque card — safe over any wallpaper. */
export const Card = surface('ui-card');
Card.displayName = 'Card';

/** Translucent Aero glass card (blurred backdrop). */
export const GlassCard = surface('ui-glass-card');
GlassCard.displayName = 'GlassCard';

/** Inset panel for grouping controls. */
export const Panel = surface('ui-panel');
Panel.displayName = 'Panel';
