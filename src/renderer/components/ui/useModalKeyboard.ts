/**
 * useModalKeyboard — the keyboard half of `role="dialog" aria-modal="true"`.
 *
 * Declaring `aria-modal` tells a screen reader that everything outside this
 * element is hidden. A dialog that does that and then leaves the keyboard
 * outside itself has made the window unusable rather than more usable, which is
 * exactly what was measured on 2026-09-06 across seven dialogs in five files
 * (register row D9): no Escape, no focus move, no trap, no restore.
 *
 * Two details are load-bearing and are why this is a hook rather than five
 * copies:
 *
 *  - **Escape is always swallowed.** The desktop shell also closes the focused
 *    window on Escape, so an unstopped Escape closes the whole window out from
 *    under the dialog. Passing `onEscape: null` refuses the close (an operation
 *    is in flight) but still stops the key — refusing must not mean handing the
 *    window to the shell.
 *  - **The callback is held in a ref.** Call sites pass inline arrows, so an
 *    effect keyed on the callback would re-run every render, re-stealing focus
 *    into the panel and re-capturing the restore target.
 *
 * The panel element must carry `tabIndex={-1}` or the initial focus move is a
 * no-op. Modelled on `components/ui/Dialog.tsx`, which already does this; new
 * call sites should prefer `Dialog` outright and reach for this hook only when
 * the dialog has its own render tree.
 */
import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export interface ModalKeyboardOptions {
  /** The dialog panel. Focus moves into it on open; Tab is trapped inside it. */
  panelRef: RefObject<HTMLElement | null>;
  /**
   * What Escape does. `null` refuses the close while still swallowing the key,
   * for a dialog with a write in flight.
   */
  onEscape: (() => void) | null;
  /** False while the dialog is mounted but not shown. Defaults to true. */
  enabled?: boolean;
}

export function useModalKeyboard({ panelRef, onEscape, enabled = true }: ModalKeyboardOptions): void {
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;

  useEffect(() => {
    if (!enabled) return;
    const restoreTo = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        escapeRef.current?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      // Without this the user lands at the top of the document and has to Tab
      // through the whole window to get back to what they were doing.
      restoreTo?.focus?.();
    };
  }, [enabled, panelRef]);
}

export default useModalKeyboard;
