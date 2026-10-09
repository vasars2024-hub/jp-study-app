/**
 * files2 — the list's keyboard model, as pure functions.
 *
 * Every row was `tabIndex=0` with Enter/Space only selecting, so the only way
 * down a 40,000-row list from the keyboard was Tab, one row at a time, and the
 * only way to OPEN a row was the mouse. These are the Explorer gestures:
 * arrows, Home/End and Page keys move the selection (the list scrolls to it),
 * Enter on the selected row opens it, Ctrl+A checks every visible row for the
 * bulk actions, and Shift+click checks a range.
 */

/** Rows a Page key moves by. */
export const FILES_PAGE_ROWS = 10;

/** Where a navigation key moves the cursor, or null for a key that is not navigation. */
export function filesCursorTarget(index: number, key: string, total: number, page = FILES_PAGE_ROWS): number | null {
  if (total <= 0) return null;
  const clamp = (n: number): number => Math.max(0, Math.min(total - 1, n));
  switch (key) {
    case 'ArrowDown':
      return clamp(index + 1);
    case 'ArrowUp':
      return clamp(index - 1);
    case 'Home':
      return 0;
    case 'End':
      return total - 1;
    case 'PageDown':
      return clamp(index + page);
    case 'PageUp':
      return clamp(index - page);
    default:
      return null;
  }
}

/** The ids from `anchorId` to `targetId` inclusive, in list order (anchor may be either end). */
export function filesRangeIds(ids: readonly string[], anchorId: string | null, targetId: string): string[] {
  const to = ids.indexOf(targetId);
  if (to < 0) return [];
  const from = anchorId ? ids.indexOf(anchorId) : -1;
  if (from < 0) return [targetId];
  const [lo, hi] = from <= to ? [from, to] : [to, from];
  return ids.slice(lo, hi + 1);
}
