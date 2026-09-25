/**
 * The Start panel's keyboard contract (round-2 a11y audit K6).
 *
 * Measured before this existed: Enter on the Start button opened the panel but
 * left focus on the button, so the only way in was a long Tab walk; the arrow keys
 * and Escape did nothing; the button announced `aria-haspopup="menu"` over a panel
 * with no menu role; and every app tile brought a second tab stop, its pin button.
 *
 * The panel is not a menu: it carries a search entry, labelled groups with
 * headings, app tiles, shortcuts and a footer — a small non-modal DIALOG with a
 * composite list inside it. So:
 *  - `role="dialog"` with the Start label; the button says `aria-haspopup="dialog"`;
 *  - opening moves focus to the first item;
 *  - the items form ONE roving tab stop: Arrow keys (both axes) step through them
 *    in reading order, Home/End jump to the ends, Tab leaves the panel;
 *  - Escape closes and puts focus back on the Start button;
 *  - focus leaving the panel for somewhere else closes it, as Start does on Windows;
 *  - secondary per-item buttons (the pin) are marked `data-start-secondary`, sit at
 *    `tabIndex={-1}` and are reached through the item's context menu (right-click,
 *    Shift+F10 or the Menu key), so they no longer double the tab order.
 */
import { useLayoutEffect, useRef, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { startKeyTarget } from './startPanelNav';

/** What counts as an item in the roving set. */
export const START_ITEM_SELECTOR = 'button:not([disabled]):not([data-start-secondary])';

export interface StartPanelProps {
  id: string;
  className: string;
  label: string;
  onClose: () => void;
  /** The Start button, so Escape can hand focus back to it. */
  returnFocusTo: () => HTMLElement | null;
  onDragOver?: (e: DragEvent<HTMLDivElement>) => void;
  onDrop?: (e: DragEvent<HTMLDivElement>) => void;
  children: ReactNode;
}

export default function StartPanel({
  id,
  className,
  label,
  onClose,
  returnFocusTo,
  onDragOver,
  onDrop,
  children,
}: StartPanelProps) {
  const ref = useRef<HTMLDivElement>(null);

  const items = (): HTMLElement[] =>
    Array.from(ref.current?.querySelectorAll<HTMLElement>(START_ITEM_SELECTOR) ?? []);

  /** One tab stop: the current item is 0, every other item -1. */
  const rove = (current: HTMLElement | null | undefined): void => {
    for (const el of items()) el.tabIndex = el === current ? 0 : -1;
  };

  const moveTo = (el: HTMLElement | undefined): void => {
    if (!el) return;
    rove(el);
    el.focus({ preventScroll: false });
  };

  // Focus on open. A layout effect so the first item is focused before paint and
  // before any child effect can race it.
  useLayoutEffect(() => {
    const first = items()[0];
    rove(first);
    first?.focus({ preventScroll: true });
    // Mount-only: the panel is unmounted when Start closes.
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      const back = returnFocusTo();
      onClose();
      back?.focus({ preventScroll: true });
      return;
    }
    const list = items();
    const active = document.activeElement as HTMLElement | null;
    const to = startKeyTarget(e.key, active ? list.indexOf(active) : -1, list.length);
    if (to === null) return;
    e.preventDefault();
    e.stopPropagation();
    moveTo(list[to]);
  };

  return (
    <div
      ref={ref}
      id={id}
      className={className}
      role="dialog"
      aria-label={label}
      onKeyDown={onKeyDown}
      // Whatever item the pointer or a context menu focused becomes the tab stop.
      onFocus={(e) => {
        const target = e.target as HTMLElement;
        if (target.matches(START_ITEM_SELECTOR)) rove(target);
      }}
      onBlur={(e) => {
        const next = e.relatedTarget as HTMLElement | null;
        // Null: focus went nowhere (a click on the panel's own padding) — stay open.
        if (!next || ref.current?.contains(next)) return;
        // The Start button toggles on its own click; closing here too would reopen it.
        if (next === returnFocusTo()) return;
        // An item's context menu is part of the panel's interaction.
        if (next.closest('.ui-menu')) return;
        onClose();
      }}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {children}
    </div>
  );
}
