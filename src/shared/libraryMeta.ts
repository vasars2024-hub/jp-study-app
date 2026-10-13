/**
 * Library item details the user can edit (Calibre's "Edit metadata", minus
 * everything Gum has no use for): title, authors, series and position, tags.
 *
 * One normalizer for both sides of the bridge. The renderer uses it to show
 * exactly what will be saved; main runs it again on whatever arrives, because
 * a patch is renderer input and is written into library.json.
 */
import type { LibraryItem } from './types';

export const LIBRARY_META_LIMITS = {
  title: 300,
  author: 300,
  series: 300,
  tag: 60,
  tags: 50,
  seriesIndexMax: 100_000,
} as const;

/**
 * A change to an item's details. A field that is absent is left alone; `null`
 * (or an empty string / empty list) clears it. A title can be changed but not
 * cleared — every item needs one.
 */
export interface LibraryMetaPatch {
  title?: string;
  author?: string | null;
  series?: string | null;
  seriesIndex?: number | null;
  tags?: string[] | null;
}

export type LibraryMetaPatchResult =
  | { ok: true; patch: LibraryMetaPatch }
  | { ok: false; errorKey: string };

/** NFC, collapsed whitespace, control characters removed. */
export function cleanMetaText(value: string): string {
  return (
    value
      .normalize('NFC')
      // eslint-disable-next-line no-control-regex -- control characters are what is being removed
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** Tags from a list or a comma-separated string: cleaned, de-duplicated (case-folded). */
export function parseLibraryTags(value: string | readonly string[]): string[] {
  const raw = typeof value === 'string' ? value.split(/[,、，]/) : value;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const tag = cleanMetaText(entry);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

function optionalText(
  value: unknown,
  max: number,
  errorKey: string,
): { ok: true; value: string | null | undefined } | { ok: false; errorKey: string } {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false, errorKey: 'libManage.meta.error.invalid' };
  const text = cleanMetaText(value);
  if (text.length > max) return { ok: false, errorKey };
  return { ok: true, value: text || null };
}

/** Validate and clean a patch from anywhere. Unknown fields are dropped. */
export function normalizeLibraryMetaPatch(value: unknown): LibraryMetaPatchResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, errorKey: 'libManage.meta.error.invalid' };
  }
  const raw = value as Record<string, unknown>;
  const patch: LibraryMetaPatch = {};

  if (raw.title !== undefined) {
    if (typeof raw.title !== 'string') return { ok: false, errorKey: 'libManage.meta.error.invalid' };
    const title = cleanMetaText(raw.title);
    if (!title) return { ok: false, errorKey: 'libManage.meta.error.titleRequired' };
    if (title.length > LIBRARY_META_LIMITS.title) return { ok: false, errorKey: 'libManage.meta.error.tooLong' };
    patch.title = title;
  }

  const author = optionalText(raw.author, LIBRARY_META_LIMITS.author, 'libManage.meta.error.tooLong');
  if (!author.ok) return author;
  if (author.value !== undefined) patch.author = author.value;

  const series = optionalText(raw.series, LIBRARY_META_LIMITS.series, 'libManage.meta.error.tooLong');
  if (!series.ok) return series;
  if (series.value !== undefined) patch.series = series.value;

  if (raw.seriesIndex !== undefined) {
    if (raw.seriesIndex === null || raw.seriesIndex === '') {
      patch.seriesIndex = null;
    } else {
      const n = typeof raw.seriesIndex === 'string' ? Number(raw.seriesIndex.trim()) : raw.seriesIndex;
      if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > LIBRARY_META_LIMITS.seriesIndexMax) {
        return { ok: false, errorKey: 'libManage.meta.error.seriesIndex' };
      }
      patch.seriesIndex = n;
    }
  }

  if (raw.tags !== undefined) {
    if (raw.tags === null) {
      patch.tags = null;
    } else if (typeof raw.tags === 'string' || Array.isArray(raw.tags)) {
      const tags = parseLibraryTags(raw.tags as string | string[]);
      if (tags.length > LIBRARY_META_LIMITS.tags || tags.some((tag) => tag.length > LIBRARY_META_LIMITS.tag)) {
        return { ok: false, errorKey: 'libManage.meta.error.tags' };
      }
      patch.tags = tags.length ? tags : null;
    } else {
      return { ok: false, errorKey: 'libManage.meta.error.invalid' };
    }
  }

  return { ok: true, patch };
}

/** The item with `patch` applied (a copy). `editedAt` marks it as user-edited. */
export function applyLibraryMetaPatch(item: LibraryItem, patch: LibraryMetaPatch, editedAt: number): LibraryItem {
  const next: LibraryItem = { ...item };
  if (patch.title !== undefined) next.title = patch.title;
  for (const key of ['author', 'series', 'seriesIndex', 'tags'] as const) {
    const value = patch[key];
    if (value === undefined) continue;
    if (value === null) delete next[key];
    else (next as unknown as Record<string, unknown>)[key] = value;
  }
  // A position without a series is meaningless and would sort a book nowhere.
  if (next.series === undefined) delete next.seriesIndex;
  next.metaEditedAt = editedAt;
  return next;
}

/** The editable fields of an item, as strings for a form. */
export function libraryMetaFormValues(item: Pick<LibraryItem, 'title' | 'author' | 'series' | 'seriesIndex' | 'tags'>): {
  title: string;
  author: string;
  series: string;
  seriesIndex: string;
  tags: string;
} {
  return {
    title: item.title,
    author: item.author ?? '',
    series: item.series ?? '',
    seriesIndex: item.seriesIndex === undefined ? '' : String(item.seriesIndex),
    tags: (item.tags ?? []).join(', '),
  };
}
