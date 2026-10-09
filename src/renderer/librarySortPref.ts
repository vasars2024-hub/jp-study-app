/**
 * The Library's sort choice, remembered between visits.
 *
 * The view used to start on "newest first" every time it mounted, so a reader
 * who sorted by title or level had to pick it again on each visit. The choice
 * is a plain preference whose only home is localStorage, so it goes through the
 * guarded writer (a refused write is reported, not dropped).
 */
import { writeLocalStorage } from './localStorageWrite';

export const LIBRARY_SORTS = [
  'recent',
  'date-desc',
  'date-asc',
  'title',
  'lang',
  'length',
  'level',
  'source',
] as const;

export type LibrarySort = (typeof LIBRARY_SORTS)[number];

export const DEFAULT_LIBRARY_SORT: LibrarySort = 'date-desc';
export const LIBRARY_SORT_STORAGE_KEY = 'jp-library-sort';

export function isLibrarySort(value: unknown): value is LibrarySort {
  return typeof value === 'string' && (LIBRARY_SORTS as readonly string[]).includes(value);
}

/** The stored sort, or the default when nothing (or something unknown) is stored. */
export function readLibrarySort(): LibrarySort {
  try {
    const raw = localStorage.getItem(LIBRARY_SORT_STORAGE_KEY);
    return isLibrarySort(raw) ? raw : DEFAULT_LIBRARY_SORT;
  } catch {
    // Storage denied: the default, as before this was remembered.
    return DEFAULT_LIBRARY_SORT;
  }
}

/** Remember `sort`; an unknown value is ignored rather than stored. */
export function writeLibrarySort(sort: LibrarySort): boolean {
  if (!isLibrarySort(sort)) return false;
  return writeLocalStorage(LIBRARY_SORT_STORAGE_KEY, sort);
}
