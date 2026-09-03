import { useEffect } from 'react';

/**
 * Outside-`pointerdown` and Escape dismissal for a `<details>` whose panel is a POPOVER —
 * one positioned out of flow, over content the user can still see.
 *
 * A native `<details>` has no light dismiss at all: it closes only when its own summary is
 * pressed again. That is correct for an inline expander and wrong for a popover, because the
 * panel steals the hit area of whatever it covers and the obvious way out (click elsewhere)
 * activates the thing underneath instead of closing.
 *
 * Measured on Statistics, 2026-09-03: with the Reset disclosure open, its 132x45 panel sits at
 * (753,143) directly over the "Sync from Anki" button at (752,157) 133x32, and
 * `document.elementFromPoint` at that button's own centre returned `BUTTON.btn.danger` — the
 * Reset action. A user who opens Reset, changes their mind and presses the button they can
 * still see presses Reset. (A confirm dialog stands behind it, so this is a stolen target
 * rather than silent data loss.)
 *
 * `pointerdown`, not `click`: a click that starts outside and ends inside a re-rendered popover
 * never fires as one `click` on the document, so the panel stays open. Escape has to leave focus
 * somewhere real, or the next Tab restarts at the document.
 *
 * Shared rather than copied. It was extracted inside `MediaLibraryBrowser` when that toolbar grew
 * its second disclosure, with the note that two copies are two chances for one to drift; the
 * third caller is what moved it here.
 */
export function useDismissableDisclosure(
  ref: React.RefObject<HTMLDetailsElement | null>,
  open: boolean,
): void {
  useEffect(() => {
    if (!open) return undefined;
    const close = () => { if (ref.current) ref.current.open = false; };
    const onDown = (event: PointerEvent) => {
      const node = ref.current;
      if (node && !node.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      close();
      ref.current?.querySelector('summary')?.focus();
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, ref]);
}
