/**
 * A toolbar disclosure: a native `<details>` (keyboard-operable and announced for
 * free), closed on an outside pointerdown and on Escape by the shared
 * `useDismissableDisclosure`, whose panel is a Liquid contextual surface — glass in
 * Liquid presentation, an opaque menu everywhere else.
 */
import { useRef, useState, type ReactNode } from 'react';
import { useDismissableDisclosure } from '../../ui';
import { ContextualSurface } from '../../liquid/LiquidSurface';
import GumIcon from './GumIcons';

export interface GumPopoverProps {
  /** Summary content: the control's visible label (and current value). */
  label: ReactNode;
  /** Accessible name when `label` alone would be ambiguous. */
  ariaLabel?: string;
  /** Marks the trigger as holding an active filter. */
  active?: boolean;
  className?: string;
  align?: 'start' | 'end';
  /** Panel width hint. */
  wide?: boolean;
  chevron?: boolean;
  /** Receives a `close` so an item can dismiss the menu after acting. */
  children: (close: () => void) => ReactNode;
}

export default function GumPopover({
  label,
  ariaLabel,
  active,
  className = '',
  align = 'start',
  wide,
  chevron = true,
  children,
}: GumPopoverProps) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  useDismissableDisclosure(ref, open);
  const close = (): void => {
    if (ref.current) ref.current.open = false;
  };
  return (
    <details
      ref={ref}
      className={`gum-pop ${className}`.trim()}
      data-active={active ? 'true' : undefined}
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="gum-pop__trigger" aria-label={ariaLabel}>
        {label}
        {chevron && <GumIcon name="chevron-down" size={12} className="gum-pop__chev" />}
      </summary>
      {open && (
        <ContextualSurface className="gum-pop__panel" data-align={align} data-wide={wide ? 'true' : undefined}>
          {children(close)}
        </ContextualSurface>
      )}
    </details>
  );
}
