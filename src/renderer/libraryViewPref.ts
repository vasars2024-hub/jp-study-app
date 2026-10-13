/**
 * The Library shelf's view choices, remembered between visits: which folder
 * is open, the grouping, grid or list, and the language / level filters.
 *
 * Sort was already remembered (`librarySortPref.ts`); everything else reset
 * on every visit, so a reader who keeps their manga grouped by series in list
 * view rebuilt that view each time. Kavita and Komga keep these per user; this
 * keeps them per profile's renderer storage, through the guarded writer.
 *
 * Every field is validated on read: a folder that has since been deleted or a
 * value from an older build falls back to its default instead of opening the
 * shelf onto a view that cannot show anything.
 */
import { writeLocalStorageJson } from './localStorageWrite';

export const LIBRARY_VIEW_STORAGE_KEY = 'jp-library-view';

export const LIBRARY_GROUPS = ['none', 'lang', 'level', 'source', 'series'] as const;
export type LibraryGroupPref = (typeof LIBRARY_GROUPS)[number];

export const LIBRARY_LANG_FILTERS = ['all', 'ja', 'zh', 'en', 'unknown'] as const;
export type LibraryLangFilterPref = (typeof LIBRARY_LANG_FILTERS)[number];

export const LIBRARY_LEVEL_FILTERS = ['all', '1', '2', '3', '4', '5', '6', '7'] as const;
export type LibraryLevelFilterPref = (typeof LIBRARY_LEVEL_FILTERS)[number];

export interface LibraryViewPref {
  /** 'all', 'unfiled' or a folder name. */
  folder: string;
  group: LibraryGroupPref;
  layout: 'grid' | 'list';
  lang: LibraryLangFilterPref;
  level: LibraryLevelFilterPref;
}

export const DEFAULT_LIBRARY_VIEW: LibraryViewPref = {
  folder: 'all',
  group: 'none',
  layout: 'grid',
  lang: 'all',
  level: 'all',
};

function oneOf<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Validate anything (a stored blob, a partial) into a complete view. */
export function normalizeLibraryView(value: unknown): LibraryViewPref {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const folder = typeof raw.folder === 'string' && raw.folder.trim() && raw.folder.length <= 200 ? raw.folder : 'all';
  return {
    folder,
    group: oneOf(LIBRARY_GROUPS, raw.group, DEFAULT_LIBRARY_VIEW.group),
    layout: oneOf(['grid', 'list'] as const, raw.layout, DEFAULT_LIBRARY_VIEW.layout),
    lang: oneOf(LIBRARY_LANG_FILTERS, raw.lang, DEFAULT_LIBRARY_VIEW.lang),
    level: oneOf(LIBRARY_LEVEL_FILTERS, raw.level, DEFAULT_LIBRARY_VIEW.level),
  };
}

export function readLibraryView(): LibraryViewPref {
  try {
    const raw = localStorage.getItem(LIBRARY_VIEW_STORAGE_KEY);
    return normalizeLibraryView(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_LIBRARY_VIEW };
  }
}

/** Merge `patch` into the stored view. Returns false when storage refused it. */
export function writeLibraryView(patch: Partial<LibraryViewPref>): boolean {
  return writeLocalStorageJson(LIBRARY_VIEW_STORAGE_KEY, normalizeLibraryView({ ...readLibraryView(), ...patch }));
}

/**
 * The folder to open: the stored one while it still exists, else All. The
 * reserved views are always valid.
 */
export function resolveStoredFolder(stored: string, folders: readonly string[]): string {
  if (stored === 'all' || stored === 'unfiled') return stored;
  return folders.includes(stored) ? stored : 'all';
}
