// Saved Browser views — ANKI_DECK_WORKBENCH_PLAN.md Phase 3 ("nested filters,
// saved views, the ordered change tray …") and the Browser section's "faceted
// filters, saved searches".
//
// A view is what the user set up to look at a deck: the query, the sort, and
// which columns were showing. It is deliberately NOT a selection — a selection
// names note ids, which mean nothing in another deck or after a reimport, and
// restoring one would silently reselect the wrong notes. A view re-derives its
// rows from whatever is loaded now, so it can never be stale in that way.
//
// A view is also deck-independent, which is the whole point of saving one: the
// same "unfinished cards" filter is worth having on every deck. That makes
// mismatch normal rather than exceptional, so applying a view reports what it
// could not restore instead of quietly dropping it. A query naming a field the
// new deck lacks refuses through the parser's own `unknown-key`, which is
// already the honest answer.
//
// Nothing here is user-visible English: a view's name is the user's own text.

import type { BrowserColumn, BrowserSort } from './ankiWorkbenchBrowser';

export const SAVED_VIEWS_VERSION = 1;
/** Renderer localStorage key. Versioned in the payload, not in the key name. */
export const SAVED_VIEWS_STORAGE_KEY = 'jp-anki-browser-views';

export interface SavedBrowserView {
  id: string;
  /** The user's own label, shown verbatim and never translated. */
  name: string;
  query: string;
  sort: BrowserSort | null;
  /** Column ids that were visible when it was saved. */
  visibleColumnIds: string[];
  savedAtSec: number;
}

export interface SavedBrowserViews {
  version: number;
  views: SavedBrowserView[];
}

export const EMPTY_SAVED_VIEWS: SavedBrowserViews = { version: SAVED_VIEWS_VERSION, views: [] };

/** Stable enough to be a key, and readable in a debugger. */
export function browserViewId(name: string, savedAtSec: number): string {
  return `view-${savedAtSec}-${name.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 32)}`;
}

export function captureBrowserView(
  name: string,
  query: string,
  sort: BrowserSort | null,
  columns: BrowserColumn[],
  savedAtSec: number,
): SavedBrowserView {
  return {
    id: browserViewId(name, savedAtSec),
    name: name.trim(),
    query,
    sort,
    visibleColumnIds: columns.filter((c) => c.visible).map((c) => c.id),
    savedAtSec,
  };
}

/**
 * Upsert by name, case-insensitively: saving "Leeches" twice replaces the first
 * rather than leaving two entries a user cannot tell apart. Newest first.
 */
export function saveBrowserView(
  saved: SavedBrowserViews,
  view: SavedBrowserView,
): SavedBrowserViews {
  const key = view.name.toLowerCase();
  const rest = saved.views.filter((v) => v.name.toLowerCase() !== key);
  return { version: SAVED_VIEWS_VERSION, views: [view, ...rest] };
}

export function removeBrowserView(saved: SavedBrowserViews, id: string): SavedBrowserViews {
  return { version: SAVED_VIEWS_VERSION, views: saved.views.filter((v) => v.id !== id) };
}

export interface AppliedBrowserView {
  columns: BrowserColumn[];
  /**
   * Ids the view wanted visible that this draft has no column for — a field
   * from another note type, typically. The surface says how many; silently
   * showing fewer columns than the view promised is the failure to avoid.
   */
  missingColumnIds: string[];
  /**
   * The view named a sort column this draft does not have, so the sort was
   * dropped. Sorting by an absent column would silently be no sort at all.
   */
  sortDropped: boolean;
}

export function applyBrowserView(columns: BrowserColumn[], view: SavedBrowserView): AppliedBrowserView {
  const present = new Set(columns.map((c) => c.id));
  const want = new Set(view.visibleColumnIds);
  const missingColumnIds = view.visibleColumnIds.filter((id) => !present.has(id));
  // A view whose columns are *all* absent would blank the grid; that is not a
  // restored view, so the current columns stay and only the mismatch is
  // reported. `toggleBrowserColumn` refuses an empty Browser for the same reason.
  const restorable = view.visibleColumnIds.some((id) => present.has(id));
  return {
    columns: restorable ? columns.map((c) => ({ ...c, visible: want.has(c.id) })) : columns,
    missingColumnIds,
    sortDropped: view.sort !== null && !present.has(view.sort.columnId),
  };
}

/** The sort the view asks for, or null when this draft has no such column. */
export function browserViewSort(columns: BrowserColumn[], view: SavedBrowserView): BrowserSort | null {
  if (!view.sort) return null;
  return columns.some((c) => c.id === view.sort?.columnId) ? view.sort : null;
}

// ----- persistence -------------------------------------------------------------

function isView(x: unknown): x is SavedBrowserView {
  if (typeof x !== 'object' || x === null) return false;
  const v = x as Partial<SavedBrowserView>;
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    v.name.trim() !== '' &&
    typeof v.query === 'string' &&
    Array.isArray(v.visibleColumnIds) &&
    v.visibleColumnIds.every((id) => typeof id === 'string') &&
    typeof v.savedAtSec === 'number' &&
    (v.sort === null ||
      v.sort === undefined ||
      (typeof v.sort === 'object' &&
        typeof (v.sort as BrowserSort).columnId === 'string' &&
        ((v.sort as BrowserSort).dir === 'asc' || (v.sort as BrowserSort).dir === 'desc')))
  );
}

/**
 * Drops malformed entries and keeps the rest. Throwing would cost a user every
 * saved view because one of them was hand-edited or written by a future
 * version, and there is nothing here worth failing a whole workbench over.
 */
export function parseSavedBrowserViews(raw: string | null): SavedBrowserViews {
  if (!raw) return EMPTY_SAVED_VIEWS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_SAVED_VIEWS;
  }
  if (typeof parsed !== 'object' || parsed === null) return EMPTY_SAVED_VIEWS;
  const record = parsed as Partial<SavedBrowserViews>;
  if (record.version !== SAVED_VIEWS_VERSION || !Array.isArray(record.views)) return EMPTY_SAVED_VIEWS;
  return {
    version: SAVED_VIEWS_VERSION,
    views: record.views.filter(isView).map((v) => ({ ...v, sort: v.sort ?? null })),
  };
}

export function serializeSavedBrowserViews(saved: SavedBrowserViews): string {
  return JSON.stringify({ version: SAVED_VIEWS_VERSION, views: saved.views });
}
