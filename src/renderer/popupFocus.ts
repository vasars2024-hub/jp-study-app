import { useLayoutEffect, type RefObject } from 'react';

/**
 * Keyboard focus follows a floating popup in and back out.
 *
 * Opened with Ctrl+Alt+L the dictionary popup appeared with focus still on the
 * page, and its first control was measured as tab stop 81 — a keyboard user could
 * see the entry and not reach it. The popup's container takes focus on mount (it
 * is the dialog, so a screen reader announces its name) and Tab walks into its
 * controls. On unmount focus returns to where it came from, but only when it would
 * otherwise be lost: a click that already moved focus somewhere real is left alone.
 */
export function usePopupFocus(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = ref.current;
    node?.focus({ preventScroll: true });
    return () => {
      const active = document.activeElement;
      const lost = !active || active === document.body || Boolean(node?.contains(active));
      if (lost && opener && opener !== document.body && opener.isConnected) {
        opener.focus({ preventScroll: true });
      }
    };
    // Mount/unmount only: a popup that swaps its word keeps the focus it has.
  }, []);
}
