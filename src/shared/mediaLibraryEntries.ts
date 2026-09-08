/**
 * Turns a flat list of media files into the things a library grid actually shows.
 *
 * A folder of 26 episodes is one entry in the library and 26 rows in the detail
 * drawer — never 26 cards. Which files collapse together depends on the category:
 * episodic content groups by series, music groups by album, and a film or a
 * personal clip is its own entry.
 *
 * Openings, endings, NCOPs, NCEDs, OVAs and specials are separated out of the
 * numbered run rather than being interleaved with it, because a run with "NCED 2"
 * sitting between episodes 11 and 12 is what makes a library feel unsorted.
 *
 * Pure and deterministic like the rest of `src/shared`: no I/O, no clock.
 */

import { mediaCategory, type MediaCategory } from './mediaCategories';
import { METADATA_ACCEPT_CONFIDENCE } from './mediaMetadataMatch';
import { resolveSeasonForEpisode } from './mediaSeasons';
import type { MediaSubtitleEvidence } from './mediaSubtitleStatus';
import { hasJapaneseSubtitles, subtitleLanguages } from './subtitleRecord';
import type { SubtitleRecord } from './subtitleRecord';
import { sortMediaItems, seriesLabel } from './mediaSorting';
import type { MediaItem } from './types';

/** Main-owned media library document, relative to Electron userData. */
export const MEDIA_LIBRARY_STORE_FILE = 'media.json';

/**
 * Where the yt-dlp downloader writes, relative to Electron userData.
 *
 * A downloaded file is NOT automatically a library row: measured against the
 * real profile on 2026-08-30 this directory held 96 files / 5.14 GB of which
 * exactly **4** appear in `media.json`. Anything read-only that wants to know
 * what this app has on disk must walk the directory as well as the store.
 */
export const MEDIA_DOWNLOAD_DIRECTORY = 'downloads';

/**
 * Read the item collection from the persisted media document.
 *
 * The live store is `{ items, watchFolder, relationships }`. A Files indexer
 * once treated it as a bare array and reported 0 items for a populated library,
 * while its matching hand-written fixture passed. Keeping the shape beside the
 * shared media model gives the writer and every read-only consumer one contract.
 * A bare array remains accepted for defensive compatibility with early builds.
 */
export function mediaItemsFromStoredDocument(value: unknown): MediaItem[] {
  if (Array.isArray(value)) return value as MediaItem[];
  if (!value || typeof value !== 'object') return [];
  const items = (value as { items?: unknown }).items;
  return Array.isArray(items) ? items as MediaItem[] : [];
}

export interface StoredMediaSubtitle {
  mediaId: string;
  mediaTitle: string;
  record: SubtitleRecord;
}

/**
 * Flatten the subtitle records held inside `media.json` without discarding the
 * owning media identity. Files catalogues need both: the record supplies the
 * real path/provenance, while the owner supplies a useful title and stable id.
 */
export function mediaSubtitleRecordsFromStoredDocument(value: unknown): StoredMediaSubtitle[] {
  const out: StoredMediaSubtitle[] = [];
  for (const item of mediaItemsFromStoredDocument(value)) {
    if (typeof item?.id !== 'string' || !Array.isArray(item.subtitles)) continue;
    const mediaTitle = typeof item.title === 'string' && item.title.trim()
      ? item.title.trim()
      : typeof item.fileName === 'string' && item.fileName.trim()
        ? item.fileName.trim()
        : item.id;
    for (const record of item.subtitles) {
      if (!record || typeof record.id !== 'string' || typeof record.path !== 'string') continue;
      out.push({ mediaId: item.id, mediaTitle, record });
    }
  }
  return out;
}

export type LibraryGrouping = 'series' | 'album' | 'none';

export interface LibraryEntry {
  /** Stable across renders and input order. Series key, album key, or item id. */
  id: string;
  grouping: LibraryGrouping;
  title: string;
  category: MediaCategory;
  /** The numbered run, ordered. For an ungrouped entry, the single file. */
  items: MediaItem[];
  /** Openings, endings, OVAs, specials, trailers — shelved apart from `items`. */
  extras: MediaItem[];
  /** The file a card click should open: the first unfinished one, else the first. */
  primary: MediaItem;
  /** Representative artwork source; the entry's own art, else the primary's. */
  artworkItem: MediaItem;
  /** The file carrying provider metadata for the series. */
  metadataItem: MediaItem;
  /** True when a provider match landed below the auto-accept threshold. */
  metadataNeedsReview: boolean;
  /** Subtitle languages held for the file a click would open. */
  subtitleLanguages: string[];
  /** Whether that file has a Japanese track, which gates the study tools. */
  hasJapaneseSubtitles: boolean;
  /**
   * How many of `episodeCount` carry Japanese. The whole-group answer, as against
   * `hasJapaneseSubtitles`, which is only ever about `primary`.
   */
  japaneseSubtitleCount: number;
  /**
   * At least one member is numbered past the entry AniList matched, with no sequel
   * resolvable — so a provider keyed on that entry cannot answer for it. D317.
   */
  subtitleSeasonUnresolved: boolean;
  /** True once discovery has actually run, so "none found" differs from "never looked". */
  subtitlesChecked: boolean;
  year: number | null;
  /** Season numbers present, ascending. Empty when the entry has no season data. */
  seasons: number[];
  episodeCount: number;
  watchedCount: number;
  /** Watched fraction of `primary`, or null when it has never been opened. */
  progress: number | null;
  lastPlayedAt: number | null;
  addedAt: number;
  favorite: boolean;
  studyQueue: boolean;
}

/** Fraction of an item considered "finished" — the tail is usually credits. */
const WATCHED_THRESHOLD = 0.92;

const GROUPING: Record<MediaCategory, LibraryGrouping> = {
  anime: 'series',
  drama: 'series',
  tv: 'series',
  podcast: 'series',
  audiobook: 'series',
  learning: 'series',
  music: 'album',
  movie: 'none',
  personal: 'none',
  inbox: 'none',
};

export function groupingForCategory(category: MediaCategory): LibraryGrouping {
  return GROUPING[category] ?? 'none';
}

/** Release kinds that belong on the extras shelf rather than in the numbered run. */
const EXTRA_KINDS = new Set(['special', 'ova', 'movie']);

export function isExtraRelease(item: MediaItem): boolean {
  return item.episodeKind !== undefined && EXTRA_KINDS.has(item.episodeKind);
}

export function watchedFraction(item: MediaItem): number | null {
  const position = item.positionSec;
  const duration = item.durationSec;
  if (typeof position !== 'number' || !Number.isFinite(position)) return null;
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) return null;
  return Math.min(1, Math.max(0, position / duration));
}

export function isWatched(item: MediaItem): boolean {
  const fraction = watchedFraction(item);
  return fraction !== null && fraction >= WATCHED_THRESHOLD;
}

/**
 * Whether an item belongs on the Continue watching shelf.
 *
 * Named and shared because it was written twice and the two copies disagreed
 * (D269). The shelf itself dropped anything `isWatched` — 92% — while the rail
 * badge counting that same shelf dropped only the last five seconds, so an
 * episode watched to 95% was counted in the badge and absent from the list it
 * labelled. Two predicates for one shelf is the bug; a shared one is the fix.
 */
export function isContinueWatching(item: MediaItem): boolean {
  return (item.positionSec ?? 0) > 0 && !isWatched(item);
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

function albumKey(item: MediaItem): string {
  const artist = text(item.artist).toLocaleLowerCase();
  const album = text(item.album).toLocaleLowerCase();
  return album ? `album:${artist}\0${album}` : '';
}

function seriesKey(item: MediaItem): string {
  const key = text(item.seriesKey);
  return key ? `series:${key}` : '';
}

/**
 * The key a file groups under, or `''` when it stands alone. A file with no
 * parsed series (or no album) never joins a group — collapsing unrelated
 * unparseable files into one card is worse than showing them separately.
 */
function groupKeyFor(item: MediaItem, grouping: LibraryGrouping): string {
  if (grouping === 'series') return seriesKey(item);
  if (grouping === 'album') return albumKey(item);
  return '';
}

/** First unfinished entry, else the last one played, else the first. */
function pickPrimary(items: readonly MediaItem[]): MediaItem {
  const unfinished = items.find((item) => !isWatched(item));
  if (unfinished) return unfinished;
  const played = [...items]
    .filter((item) => typeof item.lastPlayedAt === 'number')
    .sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0))[0];
  return played ?? items[0];
}

/** Artwork preference: whichever file carries provider key art for the series. */
function pickArtworkItem(items: readonly MediaItem[], fallback: MediaItem): MediaItem {
  return items.find((item) => text(item.posterPath)) ?? fallback;
}

/**
 * The file carrying the series' provider metadata, which is every file in a swept
 * series but only some in a partially-swept one. Falls back to the primary so the
 * drawer always has something to read.
 */
function pickMetadataItem(items: readonly MediaItem[], fallback: MediaItem): MediaItem {
  return items.find((item) => text(item.metadataSource) && text(item.metadataSource) !== 'unmatched')
    ?? fallback;
}

/** Provider episode title for a file, when the sweep fetched one. */
export function providerEpisodeTitle(item: MediaItem): string | null {
  if (typeof item.episode !== 'number') return null;
  return text(item.episodeTitles?.[String(item.episode)]) || null;
}

/**
 * Subtitle evidence for ONE file, for the per-episode rows in the detail drawer.
 *
 * D317. The drawer already renders a status pill on every episode row and already
 * had the component to do it with; the call site passed `mediaSubtitleStatus()`
 * with no arguments, which always returns `null`, so all 29 rows of The Big O
 * rendered nothing. A user who clicks a card reading "Japanese subtitles on 13 of
 * 26" lands on the one list that could tell them *which* 13 and is told nothing.
 *
 * Group-scoped fields are deliberately absent: `japanese` describes several
 * episodes and this is one file, which is the same distinction `buildEntry` draws
 * between `hasJapaneseSubtitles` and `japaneseSubtitleCount`.
 */
export function episodeSubtitleEvidence(item: MediaItem): MediaSubtitleEvidence {
  return {
    languages: subtitleLanguages(item.subtitles),
    hasJapanese: hasJapaneseSubtitles(item.subtitles),
    search: typeof item.subtitlesCheckedAt === 'number' ? 'idle' : undefined,
    wrongSeason: resolveSeasonForEpisode(item).kind === 'unresolved',
  };
}

function maxOrNull(values: readonly (number | undefined)[]): number | null {
  let best: number | null = null;
  for (const value of values) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    if (best === null || value > best) best = value;
  }
  return best;
}

function buildEntry(id: string, grouping: LibraryGrouping, members: MediaItem[]): LibraryEntry {
  const category = mediaCategory(members[0]);
  const ordered = sortMediaItems(members, grouping === 'album' ? 'track' : 'season-episode', 'asc');
  const main = ordered.filter((item) => !isExtraRelease(item));
  const extras = ordered.filter(isExtraRelease);
  // A run that is *entirely* specials (an OVA-only folder) is still a library
  // entry — it would otherwise render as a card with nothing behind it.
  const items = main.length > 0 ? main : ordered;
  const primary = pickPrimary(items);
  const metadataItem = pickMetadataItem(ordered, primary);
  const confidence = metadataItem.metadataConfidence;

  const seasons = [...new Set(
    items
      .map((item) => item.season)
      .filter((season): season is number => typeof season === 'number' && Number.isFinite(season)),
  )].sort((a, b) => a - b);

  return {
    id,
    grouping,
    title: grouping === 'album'
      ? text(members[0].album) || seriesLabel(primary)
      : grouping === 'series'
        ? seriesLabel(primary)
        : text(primary.title) || primary.fileName,
    category,
    items,
    extras: main.length > 0 ? extras : [],
    primary,
    artworkItem: pickArtworkItem(ordered, primary),
    metadataItem,
    metadataNeedsReview: typeof confidence === 'number'
      && confidence > 0
      && confidence < METADATA_ACCEPT_CONFIDENCE,
    // Read from the primary: it is the file a card click opens, so its subtitle
    // state is the one the status line is actually promising something about.
    subtitleLanguages: subtitleLanguages(primary.subtitles),
    hasJapaneseSubtitles: hasJapaneseSubtitles(primary.subtitles),
    // D316. The primary is the right subject for a ONE-FILE card and the wrong one for a
    // series: measured on the user's own library, The Big O carries Japanese on episodes 1-13
    // and nothing on 14-26, and because episode 1 is the primary the card read "Japanese
    // subtitles ready" for all 26. Counted over `items`, which is the same set `episodeCount`
    // reports, so the pill and the `0 / 26` badge beside it finally describe one thing.
    japaneseSubtitleCount: items.filter((item) => hasJapaneseSubtitles(item.subtitles)).length,
    // D317. Only members that are BOTH uncovered and unresolvable count: an episode
    // that already has its Japanese track is not waiting on a season hop, and letting
    // it set this flag would put a warning on a card that is perfectly served.
    subtitleSeasonUnresolved: items.some((item) => !hasJapaneseSubtitles(item.subtitles)
      && resolveSeasonForEpisode(item).kind === 'unresolved'),
    subtitlesChecked: typeof primary.subtitlesCheckedAt === 'number',
    year: maxOrNull(items.map((item) => item.year)),
    seasons,
    episodeCount: items.length,
    watchedCount: items.filter(isWatched).length,
    progress: watchedFraction(primary),
    lastPlayedAt: maxOrNull(items.map((item) => item.lastPlayedAt)),
    addedAt: maxOrNull(items.map((item) => item.addedAt)) ?? 0,
    favorite: items.some((item) => item.favorite === true),
    studyQueue: items.some((item) => item.studyQueue === true),
  };
}

/**
 * Collapses items into library entries. Grouping follows each item's own
 * category, so a mixed view (Home, search results) groups anime by series and
 * still shows a stray film as one card.
 */
export function buildLibraryEntries(items: readonly MediaItem[]): LibraryEntry[] {
  const groups = new Map<string, MediaItem[]>();
  const order: string[] = [];

  for (const item of items) {
    if (!item || typeof item.id !== 'string') continue;
    const grouping = groupingForCategory(mediaCategory(item));
    const key = groupKeyFor(item, grouping) || `item:${item.id}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else {
      groups.set(key, [item]);
      order.push(key);
    }
  }

  return order.map((key) => {
    const members = groups.get(key) as MediaItem[];
    const grouping = key.startsWith('item:')
      ? 'none'
      : groupingForCategory(mediaCategory(members[0]));
    return buildEntry(key, grouping, members);
  });
}

/**
 * Splits an entry's numbered run into seasons for the detail drawer.
 * Files with no season land in season 1, which is what a flat fansub folder is.
 */
export function episodesBySeason(entry: LibraryEntry): Array<{ season: number; items: MediaItem[] }> {
  const bySeason = new Map<number, MediaItem[]>();
  for (const item of entry.items) {
    const season = typeof item.season === 'number' && Number.isFinite(item.season) ? item.season : 1;
    const bucket = bySeason.get(season);
    if (bucket) bucket.push(item);
    else bySeason.set(season, [item]);
  }
  return [...bySeason.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([season, items]) => ({ season, items }));
}
