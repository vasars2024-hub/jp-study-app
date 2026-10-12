/**
 * "Gum just put this on the clipboard itself."
 *
 * Snip to cards (`snipToCards.ts`) treats a new picture on the clipboard as a
 * snip to study. Gum also writes the clipboard: the companion's "look up the
 * selection" copies the selection and then puts the user's previous clipboard
 * back — picture included — and that restored picture is not a new snip. Each
 * such write is announced here first; the watcher ignores pictures that appear
 * within a short window of one. A leaf module, so the writers need not import
 * the watcher (and the watcher's own imports never loop back to them).
 */

/** How long after a Gum write a picture on the clipboard is still Gum's. */
export const GUM_CLIPBOARD_WRITE_MS = 1500;

let until = 0;

/** Call right before Gum writes the clipboard. */
export function noteGumClipboardWrite(now = Date.now()): void {
  until = Math.max(until, now + GUM_CLIPBOARD_WRITE_MS);
}

/** Whether a clipboard change seen now is (likely) one Gum made. */
export function gumWroteClipboardRecently(now = Date.now()): boolean {
  return now < until;
}
