/**
 * How the Library shelf decides what to paint and what to detail.
 *
 * These two decisions used to be one expression inside LibraryView, and the
 * expression was written for a *permanent* inspector column: it fell back to
 * the first visible item so the pane always had something in it. The Reading
 * workspace plan asks for a contextual detail drawer instead — a pane that is
 * not in the layout when nothing is selected — and against that shape the
 * fallback is a bug, not a nicety: `setSelectedId(null)` would immediately
 * re-resolve to `visible[0]`, so the close button could never close anything
 * and the shelf could never take the width back.
 */

/**
 * How the shelf paints its items. `grid` is the default because a library is
 * browsed by recognising covers; `list` is for scanning progress, type and
 * folder membership down a long collection, which a grid is bad at.
 */
export type LibraryLayout = 'grid' | 'list';

export const LIBRARY_LAYOUTS: readonly LibraryLayout[] = ['grid', 'list'];

export const DEFAULT_LIBRARY_LAYOUT: LibraryLayout = 'grid';

/**
 * The selected item, or null.
 *
 * Selection is only honest if it survives being checked against what is
 * actually on screen. A recorded id outlives its item in three ordinary ways —
 * the item was removed, the folder was switched, a language or level filter
 * excluded it — and in every one of them the drawer must close rather than
 * hold an empty column open or, worse, quietly detail a different book.
 */
export function resolveSelection<T extends { id: string }>(
  visible: readonly T[],
  selectedId: string | null,
): T | null {
  if (!selectedId) return null;
  return visible.find((item) => item.id === selectedId) ?? null;
}

/** What the workbench publishes so CSS can drop the drawer's column entirely. */
export function drawerState(selected: unknown): 'open' | 'closed' {
  return selected ? 'open' : 'closed';
}
