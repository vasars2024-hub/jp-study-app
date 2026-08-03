/**
 * Type-specific ordering for the media library.
 *
 * The library used to render whatever order `media:list` happened to return. The
 * problem with a single generic sort list is that most of its entries are
 * meaningless for most of the library: "track number" says nothing about an anime
 * episode and "season / episode" says nothing about an album. So the sort menu is
 * derived from the item's Hub category — {@link sortOptionsForCategory} is the
 * only thing a surface needs to call to know what to offer.
 *
 * Pure, synchronous and deterministic, like the rest of `src/shared`: no I/O, no
 * clock, no `Math.random`. Ordering never depends on the input order, because
 * every comparator ends on an id tiebreak.
 *
 * Missing data is ordered *last in both directions*. An episode with no air date
 * is not "the oldest" — it is unknown, and flipping the direction should not
 * promote a hole to the top of the grid.
 */

import type { MediaCategory } from './mediaCategories';
import type { MediaItem } from './types';

export type MediaSortId =
  | 'recently-added'
  | 'title'
  | 'series'
  | 'season-episode'
  | 'air-date'
  | 'release-year'
  | 'progress'
  | 'artist'
  | 'album'
  | 'track'
  | 'play-count'
  | 'author'
  | 'narrator'
  | 'chapter'
  | 'folder'
  | 'custom';

export type MediaSortDirection = 'asc' | 'desc';

export interface MediaSortOption {
  id: MediaSortId;
  /** i18n key resolved by the consumer at render time, never at module scope. */
  labelKey: string;
  /** The direction that reads as "natural" for this field when first selected. */
  defaultDirection: MediaSortDirection;
}

export const MEDIA_SORTS: Record<MediaSortId, MediaSortOption> = {
  'recently-added': { id: 'recently-added', labelKey: 'media.sort.recentlyAdded', defaultDirection: 'desc' },
  title: { id: 'title', labelKey: 'media.sort.title', defaultDirection: 'asc' },
  series: { id: 'series', labelKey: 'media.sort.series', defaultDirection: 'asc' },
  'season-episode': { id: 'season-episode', labelKey: 'media.sort.seasonEpisode', defaultDirection: 'asc' },
  'air-date': { id: 'air-date', labelKey: 'media.sort.airDate', defaultDirection: 'asc' },
  'release-year': { id: 'release-year', labelKey: 'media.sort.releaseYear', defaultDirection: 'desc' },
  progress: { id: 'progress', labelKey: 'media.sort.progress', defaultDirection: 'desc' },
  artist: { id: 'artist', labelKey: 'media.sort.artist', defaultDirection: 'asc' },
  album: { id: 'album', labelKey: 'media.sort.album', defaultDirection: 'asc' },
  track: { id: 'track', labelKey: 'media.sort.track', defaultDirection: 'asc' },
  'play-count': { id: 'play-count', labelKey: 'media.sort.playCount', defaultDirection: 'desc' },
  author: { id: 'author', labelKey: 'media.sort.author', defaultDirection: 'asc' },
  narrator: { id: 'narrator', labelKey: 'media.sort.narrator', defaultDirection: 'asc' },
  chapter: { id: 'chapter', labelKey: 'media.sort.chapter', defaultDirection: 'asc' },
  folder: { id: 'folder', labelKey: 'media.sort.folder', defaultDirection: 'asc' },
  custom: { id: 'custom', labelKey: 'media.sort.custom', defaultDirection: 'asc' },
};

/**
 * Which sorts to offer for a category, in menu order. The first entry is also the
 * category's default — see {@link defaultSortForCategory}.
 */
const SORTS_BY_CATEGORY: Record<MediaCategory, MediaSortId[]> = {
  anime: ['series', 'season-episode', 'air-date', 'progress', 'recently-added', 'release-year', 'title'],
  drama: ['series', 'season-episode', 'air-date', 'progress', 'recently-added', 'release-year', 'title'],
  tv: ['series', 'season-episode', 'air-date', 'progress', 'recently-added', 'release-year', 'title'],
  movie: ['title', 'release-year', 'air-date', 'progress', 'recently-added'],
  music: ['artist', 'album', 'track', 'release-year', 'title', 'recently-added', 'play-count'],
  podcast: ['series', 'season-episode', 'air-date', 'progress', 'recently-added', 'author', 'title'],
  // `narrator` is deliberately absent: nothing in the app can populate it (there
  // is no audiobook metadata provider), so offering it would be a sort that
  // silently orders everything identically. Restore it alongside a source.
  audiobook: ['series', 'chapter', 'author', 'progress', 'recently-added', 'title'],
  learning: ['folder', 'series', 'chapter', 'recently-added', 'title', 'custom'],
  personal: ['folder', 'recently-added', 'title', 'custom'],
  inbox: ['recently-added', 'title', 'folder', 'progress'],
};

export function sortOptionsForCategory(category: MediaCategory): MediaSortId[] {
  return SORTS_BY_CATEGORY[category] ?? SORTS_BY_CATEGORY.inbox;
}

export function defaultSortForCategory(category: MediaCategory): MediaSortId {
  return sortOptionsForCategory(category)[0];
}

export function isMediaSortId(value: unknown): value is MediaSortId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(MEDIA_SORTS, value);
}

/** Narrows a persisted sort back into the set the current category actually offers. */
export function resolveSortForCategory(value: unknown, category: MediaCategory): MediaSortId {
  const allowed = sortOptionsForCategory(category);
  return isMediaSortId(value) && allowed.includes(value) ? value : allowed[0];
}

// ---------------------------------------------------------------------------
// Field readers
// ---------------------------------------------------------------------------

const text = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const positive = (value: unknown): number | null => {
  const n = finite(value);
  return n !== null && n > 0 ? n : null;
};

/** Watched fraction, `null` unless both a position and a duration are known. */
function progressFraction(item: MediaItem): number | null {
  const position = finite(item.positionSec);
  const duration = positive(item.durationSec);
  if (position === null || duration === null) return null;
  return Math.min(1, Math.max(0, position / duration));
}

/**
 * `season * 10000 + episode`, so a single number orders a whole run. A file with a
 * season but no episode sorts ahead of that season's episodes rather than dropping
 * out — season packs belong at the head of their season, not in the unknown bucket.
 */
function seasonEpisodeOrdinal(item: MediaItem): number | null {
  const season = finite(item.season);
  const episode = finite(item.episode);
  if (season === null && episode === null) return null;
  return (season ?? 1) * 10_000 + (episode ?? 0);
}

const DISC_TRACK = /(?:^|[^\d])(\d{1,2})\s*[-_.]\s*(\d{1,3})(?:[^\d]|$)/;
const LEADING_TRACK = /^\s*(\d{1,3})(?=\s*[-_.\s])/;

/**
 * Disc/track ordinal read out of the file name (`1-03 Title`, `03 - Title`).
 * Music files rarely carry parsed tag data here yet, and the numbering in the name
 * is what the user sees in every other player, so it is the honest source.
 */
function trackOrdinal(item: MediaItem): number | null {
  const name = baseName(item);
  const discTrack = DISC_TRACK.exec(name);
  if (discTrack) return Number(discTrack[1]) * 1000 + Number(discTrack[2]);
  const leading = LEADING_TRACK.exec(name);
  if (leading) return Number(leading[1]);
  return null;
}

function baseName(item: MediaItem): string {
  const source = text(item.fileName) ?? text(item.path) ?? '';
  const cut = Math.max(source.lastIndexOf('/'), source.lastIndexOf('\\'));
  return cut >= 0 ? source.slice(cut + 1) : source;
}

function folderPath(item: MediaItem): string | null {
  const source = text(item.fileName) ?? text(item.path);
  if (!source) return null;
  const normalized = source.replace(/\\/g, '/');
  const cut = normalized.lastIndexOf('/');
  return cut > 0 ? normalized.slice(0, cut) : null;
}

/** The grouping title — the parsed series name when known, else the display title. */
export function seriesLabel(item: MediaItem): string {
  return text(item.seriesTitle) ?? text(item.title) ?? baseName(item) ?? '';
}

/** Air date when a provider supplied one, otherwise the release year as a date. */
function airDateOrdinal(item: MediaItem): number | null {
  const aired = positive(item.airedAt);
  if (aired !== null) return aired;
  const year = positive(item.year);
  return year !== null ? Date.UTC(year, 0, 1) : null;
}

// ---------------------------------------------------------------------------
// Comparators
// ---------------------------------------------------------------------------

interface Field {
  /** Compares two items that both have a value. Ascending. */
  compare: (a: MediaItem, b: MediaItem) => number;
  /** Whether the item carries a usable value for this field. */
  present: (item: MediaItem) => boolean;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function numberField(pick: (item: MediaItem) => number | null): Field {
  return {
    present: (item) => pick(item) !== null,
    compare: (a, b) => (pick(a) as number) - (pick(b) as number),
  };
}

function textField(pick: (item: MediaItem) => string | null): Field {
  return {
    present: (item) => pick(item) !== null,
    compare: (a, b) => collator.compare(pick(a) as string, pick(b) as string),
  };
}

/** Chains fields left to right, first difference wins. Present only if the head is. */
function chain(...fields: Field[]): Field {
  return {
    present: (item) => fields[0].present(item),
    compare: (a, b) => {
      for (const field of fields) {
        const aHas = field.present(a);
        const bHas = field.present(b);
        if (!aHas && !bHas) continue;
        if (!aHas) return 1;
        if (!bHas) return -1;
        const result = field.compare(a, b);
        if (result !== 0) return result;
      }
      return 0;
    },
  };
}

const titleField = textField((item) => text(item.title) ?? baseName(item) ?? null);
const seriesField = textField((item) => text(seriesLabel(item)));
const seasonEpisodeField = numberField(seasonEpisodeOrdinal);

const FIELDS: Record<MediaSortId, Field> = {
  'recently-added': numberField((item) => positive(item.addedAt)),
  title: titleField,
  series: chain(seriesField, seasonEpisodeField, titleField),
  'season-episode': chain(seasonEpisodeField, titleField),
  'air-date': chain(numberField(airDateOrdinal), seasonEpisodeField),
  'release-year': chain(numberField((item) => positive(item.year)), titleField),
  progress: numberField(progressFraction),
  artist: chain(
    textField((item) => text(item.artist)),
    textField((item) => text(item.album)),
    numberField(trackOrdinal),
    titleField,
  ),
  album: chain(textField((item) => text(item.album)), numberField(trackOrdinal), titleField),
  track: chain(numberField(trackOrdinal), titleField),
  'play-count': numberField((item) => finite(item.listenCount)),
  author: chain(textField((item) => text(item.artist)), seriesField, numberField(trackOrdinal)),
  narrator: chain(textField((item) => text(item.narrator)), seriesField, numberField(trackOrdinal)),
  chapter: chain(numberField(trackOrdinal), seasonEpisodeField, titleField),
  // Inside a folder the file name is the meaningful order (lesson 1, lesson 2…),
  // not the display title — folder sort is what course/personal media leans on.
  folder: chain(textField(folderPath), textField((item) => text(baseName(item))), titleField),
  // Preserves the caller's order; the id tiebreak below is skipped for it.
  custom: { present: () => false, compare: () => 0 },
};

/**
 * Returns a new array ordered by `sortId`. Items missing the sorted field are kept
 * and pushed to the end in both directions. `custom` preserves the input order.
 */
export function sortMediaItems(
  items: readonly MediaItem[],
  sortId: MediaSortId,
  direction: MediaSortDirection = MEDIA_SORTS[sortId]?.defaultDirection ?? 'asc',
): MediaItem[] {
  const list = [...items];
  if (sortId === 'custom' || !FIELDS[sortId]) return list;

  const field = FIELDS[sortId];
  const sign = direction === 'desc' ? -1 : 1;

  return list.sort((a, b) => {
    const aHas = field.present(a);
    const bHas = field.present(b);
    // Direction-independent: unknown values never climb to the top on a flip.
    if (!aHas && !bHas) return collator.compare(a.id, b.id);
    if (!aHas) return 1;
    if (!bHas) return -1;

    const primary = field.compare(a, b);
    if (primary !== 0) return sign * primary;
    // Stable, input-order-independent tiebreak.
    const byTitle = titleField.compare(a, b);
    return byTitle !== 0 ? byTitle : collator.compare(a.id, b.id);
  });
}
