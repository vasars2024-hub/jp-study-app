/**
 * Automatic media ingest — the pure half.
 *
 * The goal is the fewest steps between "a download finished" and "it is in the
 * library, sorted": every finished torrent and every file that lands in a
 * watched folder becomes a library item on its own, carrying whatever identity
 * the Scraper already had for it (catalogue ids, series title, episode) so the
 * metadata pass can use an exact match instead of a fuzzy title search.
 *
 * Everything here is deterministic and takes its clock and path rules as
 * arguments, so the rules are unit-tested without a filesystem, a torrent
 * client or Electron. The impure halves are `main/mediaIngest.ts` (service,
 * IPC, persistence), `main/mediaIngestWatch.ts` (watch folders) and
 * `main/mediaIngestQbit.ts` (qBittorrent completion).
 */

import { MEDIA_CATEGORIES, type MediaCategory } from './mediaCategories';
import { isIncompleteName } from './filesApp/scan';
import { AUDIO_EXT, MEDIA_EXT, VIDEO_EXT, extOf, type MediaKind } from './mediaKind';
import { parseMediaFileName } from './mediaFileIdentity';
/**
 * The Scraper series fields a hint reads — the same names and types as `SeriesMetadata` in
 * `scraperResults.ts`, declared here so this module does not import it: that import closed a
 * cycle (acquisition → mediaIngest → scraperResults → acquisition) the architecture gate rejects.
 */
interface ScraperSeriesIdentity {
  malId: number | null;
  aniListId: number | null;
  titleEn: string;
  titleRomaji: string;
  titleJa: string;
}
import type { MediaItem } from './types';

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

export const MEDIA_INGEST_CHANNELS = {
  /** invoke → `MediaIngestState`. */
  getState: 'mediaIngest:getState',
  /** main → renderer, `MediaIngestState`, whenever folders / status change. */
  state: 'mediaIngest:state',
  /** invoke → `MediaIngestState`; opens a folder picker. */
  addFolder: 'mediaIngest:addFolder',
  /** invoke(path) → `MediaIngestState`. An auto-added folder is dismissed, not just removed. */
  removeFolder: 'mediaIngest:removeFolder',
  /** invoke(boolean) → `MediaIngestState`. */
  setAutoImport: 'mediaIngest:setAutoImport',
  /** invoke(ScraperQbittorrentSettings | null) — the renderer's active qBittorrent profile. */
  syncQbit: 'mediaIngest:syncQbit',
  /** invoke → `MediaIngestState`; re-scans every watched folder and polls qBittorrent now. */
  rescan: 'mediaIngest:rescan',
  /** main → renderer, `MediaIngestedEvent`, after new items landed in the library. */
  ingested: 'media:ingested',
} as const;

// ---------------------------------------------------------------------------
// Hints — what the Scraper knew about a download when it handed it off
// ---------------------------------------------------------------------------

export interface MediaIngestHint {
  /** Where the identity came from: `mal`, `anilist`, `scraper`, `seanime`, `tags`. */
  provider?: string;
  malId?: number;
  anilistId?: number;
  /** Series title as the catalogue names it. */
  title?: string;
  nativeTitle?: string;
  season?: number;
  /** Episodes this download covers. One value on a one-video torrent is taken as exact. */
  episodes?: number[];
  category?: MediaCategory;
  posterUrl?: string;
  year?: number;
}

/**
 * What a handoff (MAL dialog, Torrent Manager, Seanime route) sends alongside
 * the torrents, so main can remember who they are and put them in the right
 * place.
 */
export interface ScraperIngestHandoff {
  hint?: MediaIngestHint;
  /** Episodes each torrent row covers, keyed by `TorrentRow.id`. */
  rowEpisodes?: Record<string, number[]>;
  /** The dialog's destination folder. For qBittorrent this turns Automatic Torrent Management off. */
  savePath?: string;
  /** Which surface handed it off — kept in the ledger for diagnosis only. */
  via?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function positiveInt(value: unknown): number | undefined {
  const n = typeof value === 'string' && value.trim() ? Number(value) : value;
  return typeof n === 'number' && Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

function cleanText(value: unknown, max = 300): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/\s+/g, ' ').trim().slice(0, max);
  return text || undefined;
}

function episodeList(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = [...new Set(value
    .map((n) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 && n < 100_000 ? n : NaN))
    .filter((n) => !Number.isNaN(n)))].sort((a, b) => a - b).slice(0, 2_000);
  return out.length ? out : undefined;
}

/** Validates a hint that crossed IPC or came off disk. Returns undefined when it says nothing. */
export function normalizeIngestHint(raw: unknown): MediaIngestHint | undefined {
  if (!isRecord(raw)) return undefined;
  const category = typeof raw.category === 'string' && (MEDIA_CATEGORIES as readonly string[]).includes(raw.category)
    ? (raw.category as MediaCategory)
    : undefined;
  const posterUrl = cleanText(raw.posterUrl, 2_000);
  const hint: MediaIngestHint = {
    provider: cleanText(raw.provider, 40),
    malId: positiveInt(raw.malId),
    anilistId: positiveInt(raw.anilistId),
    title: cleanText(raw.title),
    nativeTitle: cleanText(raw.nativeTitle),
    season: positiveInt(raw.season),
    episodes: episodeList(raw.episodes),
    category,
    posterUrl: posterUrl && /^https?:\/\//i.test(posterUrl) ? posterUrl : undefined,
    year: positiveInt(raw.year),
  };
  for (const key of Object.keys(hint) as Array<keyof MediaIngestHint>) {
    if (hint[key] === undefined) delete hint[key];
  }
  return Object.keys(hint).length ? hint : undefined;
}

/** `primary` wins field by field; `fallback` fills the gaps. */
export function mergeIngestHints(
  primary: MediaIngestHint | undefined,
  fallback: MediaIngestHint | undefined,
): MediaIngestHint | undefined {
  if (!primary) return fallback ? { ...fallback } : undefined;
  if (!fallback) return { ...primary };
  const merged: MediaIngestHint = { ...fallback };
  for (const [key, value] of Object.entries(primary) as Array<[keyof MediaIngestHint, unknown]>) {
    if (value !== undefined) (merged as Record<string, unknown>)[key] = value;
  }
  return merged;
}

/** The Scraper's own identification of a series (a stored scrape run) as a hint. */
export function hintFromSeriesMetadata(
  metadata: ScraperSeriesIdentity | null | undefined,
): MediaIngestHint | undefined {
  if (!metadata) return undefined;
  return normalizeIngestHint({
    provider: 'scraper',
    malId: metadata.malId ?? undefined,
    anilistId: metadata.aniListId ?? undefined,
    title: metadata.titleEn || metadata.titleRomaji || undefined,
    nativeTitle: metadata.titleJa || undefined,
    category: metadata.malId || metadata.aniListId ? 'anime' : undefined,
  });
}

export function normalizeIngestHandoff(raw: unknown): ScraperIngestHandoff | undefined {
  if (!isRecord(raw)) return undefined;
  const out: ScraperIngestHandoff = {};
  const hint = normalizeIngestHint(raw.hint);
  if (hint) out.hint = hint;
  if (isRecord(raw.rowEpisodes)) {
    const rows: Record<string, number[]> = {};
    for (const [id, value] of Object.entries(raw.rowEpisodes).slice(0, 500)) {
      const list = episodeList(value);
      if (list && id) rows[id.slice(0, 200)] = list;
    }
    if (Object.keys(rows).length) out.rowEpisodes = rows;
  }
  const savePath = cleanText(raw.savePath, 1_024);
  if (savePath && isAbsolutePathLike(savePath)) out.savePath = savePath;
  const via = cleanText(raw.via, 40);
  if (via) out.via = via;
  return out;
}

// ---------------------------------------------------------------------------
// Paths and file names
// ---------------------------------------------------------------------------

/** Drive-letter, UNC or POSIX absolute. `path.isAbsolute` is not available in shared code. */
export function isAbsolutePathLike(value: string): boolean {
  return /^(?:[a-zA-Z]:[\\/]|\\\\|\/)/.test(value);
}

/**
 * A comparison key for a path: one separator, no trailing slash, and (by
 * default) case-folded, because Windows paths that differ only in case are the
 * same file — and a torrent client, the OS watcher and the library all spell
 * the same path slightly differently.
 */
export function ingestPathKey(value: string, caseInsensitive = true): string {
  let key = value.trim().replace(/\\/g, '/').replace(/\/{2,}/g, (m, offset: number) => (offset === 0 ? '//' : '/'));
  if (key.length > 1 && key.endsWith('/') && !/^[a-zA-Z]:\/$/.test(key)) key = key.replace(/\/+$/, '');
  return caseInsensitive ? key.toLowerCase() : key;
}

/** True when `child` is `parent` or inside it. Both are keys from `ingestPathKey`. */
export function isPathKeyWithin(childKey: string, parentKey: string): boolean {
  if (!parentKey) return false;
  if (childKey === parentKey) return true;
  const prefix = parentKey.endsWith('/') ? parentKey : `${parentKey}/`;
  return childKey.startsWith(prefix);
}

function baseName(value: string): string {
  const parts = value.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

function stemOf(name: string): string {
  const ext = extOf(name);
  return ext ? name.slice(0, -ext.length) : name;
}

/** Directory names never walked for media. Compared case-insensitively. */
export const INGEST_SKIP_DIRS: ReadonlySet<string> = new Set([
  '$recycle.bin',
  'system volume information',
  '.git',
  'node_modules',
  // qBittorrent parks the files a user deselected here.
  '.unwanted',
  '@eadir',
  '.trash',
  '.trashes',
  'sample',
  'samples',
]);

export function isSkippedIngestDir(name: string): boolean {
  return INGEST_SKIP_DIRS.has(name.trim().toLowerCase());
}

const SAMPLE = /(?:^|[\s._\-[(])sample(?:[\s._\-\])]|$)/i;

/** A release's preview clip — never an episode. */
export function isSampleName(fileName: string): boolean {
  return SAMPLE.test(stemOf(baseName(fileName)));
}

/**
 * A file a downloader writes on the way to the real one. yt-dlp in particular
 * downloads video and audio as `Title [id].f137.mp4` / `.f140.m4a` and merges
 * them through `Title [id].temp.mp4` — all perfectly ordinary media names, all
 * gone a moment later.
 */
export function isDownloaderIntermediate(fileName: string): boolean {
  const name = baseName(fileName);
  return /\.f\d{2,4}(?:-\d+)?\.[a-z0-9]{2,5}$/i.test(name)
    || /\.temp\.[a-z0-9]{2,5}$/i.test(name)
    || /\.part-frag\d+/i.test(name)
    || name.startsWith('.');
}

/** Media by extension, finished, not a sample and not a downloader's scratch file. */
export function isIngestCandidateName(fileName: string): boolean {
  const name = baseName(fileName);
  if (!name) return false;
  if (!MEDIA_EXT.has(extOf(name))) return false;
  if (isIncompleteName(name)) return false;
  if (isSampleName(name)) return false;
  if (isDownloaderIntermediate(name)) return false;
  return true;
}

/** The name rule plus the folder rule: nothing under a `Sample/` or skipped directory. */
export function isIngestCandidatePath(filePath: string): boolean {
  if (!isIngestCandidateName(filePath)) return false;
  const dirs = filePath.replace(/\\/g, '/').split('/').slice(0, -1);
  return !dirs.some((dir) => isSkippedIngestDir(dir));
}

/** Smallest file an automatic source will import. A 40 KB `.mkv` is not an episode. */
export const MIN_AUTO_VIDEO_BYTES = 2 * 1024 * 1024;
export const MIN_AUTO_AUDIO_BYTES = 64 * 1024;

/** Size floor for automatic sources (watch folders, finished torrents). Manual imports skip it. */
export function isIngestSizePlausible(fileName: string, sizeBytes: number): boolean {
  const ext = extOf(baseName(fileName));
  if (VIDEO_EXT.has(ext)) return sizeBytes >= MIN_AUTO_VIDEO_BYTES;
  if (AUDIO_EXT.has(ext)) return sizeBytes >= MIN_AUTO_AUDIO_BYTES;
  return false;
}

// ---------------------------------------------------------------------------
// Torrent identity: info hashes and tags
// ---------------------------------------------------------------------------

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32ToHex(value: string): string {
  let bits = '';
  for (const char of value.toUpperCase()) {
    const index = BASE32.indexOf(char);
    if (index < 0) return '';
    bits += index.toString(2).padStart(5, '0');
  }
  let hex = '';
  for (let i = 0; i + 4 <= bits.length; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

/**
 * The v1 info hash a magnet names, as the lowercase hex qBittorrent reports.
 * Hex and base32 `btih` both decode; anything else is `''`.
 */
export function infoHashFromMagnet(magnet: string): string {
  const hex = /\bxt=urn:bt(?:ih|mh):([0-9a-fA-F]{40}|[0-9a-fA-F]{64})\b/.exec(magnet ?? '');
  if (hex) return hex[1].toLowerCase();
  const b32 = /\bxt=urn:btih:([A-Za-z2-7]{32})\b/.exec(magnet ?? '');
  return b32 ? base32ToHex(b32[1]) : '';
}

export function normalizeInfoHash(value: unknown): string {
  return typeof value === 'string' && /^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$/.test(value.trim())
    ? value.trim().toLowerCase()
    : '';
}

/** The tag every torrent this app hands to qBittorrent carries. */
export const GUM_TAG = 'gum';

/** `gum` plus one tag per catalogue id, so identity survives a lost ledger. */
export function ingestTagsForHint(hint: MediaIngestHint | undefined): string[] {
  const tags = [GUM_TAG];
  if (hint?.anilistId) tags.push(`gum:al:${hint.anilistId}`);
  if (hint?.malId) tags.push(`gum:mal:${hint.malId}`);
  return tags;
}

export function isGumTagged(tags: readonly string[]): boolean {
  return tags.some((tag) => tag.trim().toLowerCase() === GUM_TAG || tag.trim().toLowerCase().startsWith('gum:'));
}

/** Reads the ids back out of a torrent's tags. */
export function hintFromTags(tags: readonly string[]): MediaIngestHint | undefined {
  const hint: MediaIngestHint = {};
  for (const tag of tags) {
    const match = /^gum:(al|mal):(\d{1,9})$/i.exec(tag.trim());
    if (!match) continue;
    const id = Number(match[2]);
    if (!id) continue;
    if (match[1].toLowerCase() === 'al') hint.anilistId = id;
    else hint.malId = id;
  }
  if (!hint.anilistId && !hint.malId) return undefined;
  hint.provider = 'tags';
  // Only the anime catalogue ids are ever written as tags, and the metadata
  // pass looks up only anime/TV/drama — so the category travels with them.
  hint.category = 'anime';
  return hint;
}

// ---------------------------------------------------------------------------
// qBittorrent rename template
// ---------------------------------------------------------------------------

const PLACEHOLDER = /\{([a-z]+)\}/gi;

export function hasRenamePlaceholders(template: string): boolean {
  return /\{[a-z]+\}/i.test(template ?? '');
}

function pad2(value: number): string {
  return Number.isInteger(value) ? String(value).padStart(2, '0') : String(value);
}

/**
 * Fills `{series}`, `{title}`, `{episode}` and `{season}`.
 *
 * Returns `''` when any placeholder cannot be filled: a torrent named
 * `Frieren - {episode}` is worse than one left with its release name, and that
 * literal string is exactly what used to reach qBittorrent.
 */
export function renderRenameTemplate(
  template: string,
  fields: { series?: string; episode?: number | [number, number]; season?: number },
): string {
  if (!template?.trim()) return '';
  let missing = false;
  const out = template.replace(PLACEHOLDER, (_match, name: string) => {
    switch (name.toLowerCase()) {
      case 'series':
      case 'title':
        if (!fields.series) missing = true;
        return fields.series ?? '';
      case 'episode':
        if (fields.episode === undefined) {
          missing = true;
          return '';
        }
        return Array.isArray(fields.episode)
          ? `${pad2(fields.episode[0])}-${pad2(fields.episode[1])}`
          : pad2(fields.episode);
      case 'season':
        if (fields.season === undefined) missing = true;
        return fields.season === undefined ? '' : pad2(fields.season);
      default:
        missing = true;
        return '';
    }
  });
  if (missing) return '';
  // qBittorrent refuses path separators in a name; they would also split the root folder.
  return out.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * The name to give one torrent. The hint's catalogue title and the row's own
 * episodes win; the release name fills whatever they do not say.
 */
export function renameForTorrent(
  template: string,
  releaseName: string,
  hint?: MediaIngestHint,
  episodes?: readonly number[],
): string {
  if (!hasRenamePlaceholders(template)) return '';
  const parsed = parseMediaFileName(releaseName);
  const list = episodes?.length ? [...episodes].sort((a, b) => a - b) : undefined;
  let episode: number | [number, number] | undefined;
  if (list && list.length === 1) episode = list[0];
  else if (list && list.length > 1) episode = [list[0], list[list.length - 1]];
  else if (parsed.episode !== null) {
    episode = parsed.episodeEnd !== null && parsed.episodeEnd !== parsed.episode
      ? [parsed.episode, parsed.episodeEnd]
      : parsed.episode;
  }
  return renderRenameTemplate(template, {
    series: hint?.title || parsed.title || undefined,
    episode,
    season: hint?.season ?? parsed.season ?? undefined,
  });
}

// ---------------------------------------------------------------------------
// Applying a hint to a library item
// ---------------------------------------------------------------------------

/**
 * The series-level fields a metadata pass writes onto every file of a title.
 * Copied from an already-matched sibling so a new episode of a known show is
 * sorted, titled and postered the moment it lands — and so the next sweep sees
 * it as fetched rather than searching the whole show again.
 */
export const SERIES_METADATA_FIELDS = [
  'seriesTitle',
  'nativeTitle',
  'synopsis',
  'year',
  'format',
  'status',
  'episodeCount',
  'episodeTitles',
  'genres',
  'studio',
  'rating',
  'rank',
  'relatedTitles',
  'relatedWorks',
  'malId',
  'anilistId',
  'posterPath',
  'bannerPath',
  'category',
  'metadataSource',
  'metadataUpdatedAt',
  'metadataConfidence',
] as const satisfies ReadonlyArray<keyof MediaItem>;

function isMatched(item: MediaItem): boolean {
  return Boolean(item.metadataSource && item.metadataSource !== 'unmatched' && item.metadataUpdatedAt);
}

/**
 * An already-matched library item of the same series, or undefined.
 *
 * With catalogue ids the match is by id, which is exact. Without them it falls
 * back to the parsed series key — but only within the same season, because one
 * key can cover two seasons that the catalogue files under two different ids.
 */
export function findSeriesSibling(
  items: readonly MediaItem[],
  item: MediaItem,
  hint?: MediaIngestHint,
  exclude: ReadonlySet<string> = new Set(),
): { sibling: MediaItem; byId: boolean } | undefined {
  const pool = items.filter((other) => other.id !== item.id && !exclude.has(other.id) && isMatched(other));
  if (hint?.anilistId) {
    const sibling = pool.find((other) => other.anilistId === hint.anilistId);
    if (sibling) return { sibling, byId: true };
  }
  if (hint?.malId) {
    const sibling = pool.find((other) => other.malId === hint.malId);
    if (sibling) return { sibling, byId: true };
  }
  if (hint?.anilistId || hint?.malId) return undefined;
  if (!item.seriesKey || (item.kind && item.kind !== 'video')) return undefined;
  const season = item.season ?? 1;
  const sibling = pool.find((other) => other.seriesKey === item.seriesKey
    && (other.season ?? 1) === season
    && (!other.kind || other.kind === 'video'));
  return sibling ? { sibling, byId: false } : undefined;
}

export function seriesPatchFromSibling(
  sibling: MediaItem,
  item: MediaItem,
  adoptSeriesKey: boolean,
): Partial<MediaItem> {
  const patch: Partial<MediaItem> = {};
  for (const key of SERIES_METADATA_FIELDS) {
    const value = sibling[key];
    if (value === undefined) continue;
    (patch as Record<string, unknown>)[key] = Array.isArray(value)
      ? [...value]
      : isRecord(value) ? { ...value } : value;
  }
  // Grouping follows the series key, so a release named differently from the
  // episodes already on the shelf joins them only if it takes their key.
  if (adoptSeriesKey && sibling.seriesKey && sibling.seriesKey !== item.seriesKey) {
    patch.seriesKey = sibling.seriesKey;
  }
  if (adoptSeriesKey && sibling.season !== undefined && item.season === undefined) {
    patch.season = sibling.season;
  }
  return patch;
}

export interface HintPatchContext {
  /** The item was created by this ingest, so the hint outranks the name parser. */
  isNew: boolean;
  /** How many video files the same download produced. */
  videoCount: number;
}

/**
 * What a hint changes on one item. Never touches an item whose metadata is
 * already settled beyond filling in missing ids, and never unsets anything.
 */
export function hintPatchForItem(
  item: MediaItem,
  hint: MediaIngestHint | undefined,
  context: HintPatchContext,
): Partial<MediaItem> {
  const patch: Partial<MediaItem> = {};
  if (!hint) return patch;
  const open = context.isNew || !item.metadataSource;
  const video = !item.kind || item.kind === 'video';

  if (hint.malId && !item.malId) patch.malId = hint.malId;
  if (hint.anilistId && !item.anilistId) patch.anilistId = hint.anilistId;
  if (!open) return patch;

  if (video && hint.category && item.category !== hint.category) patch.category = hint.category;
  if (hint.title && item.seriesTitle !== hint.title) patch.seriesTitle = hint.title;
  if (hint.nativeTitle && !item.nativeTitle) patch.nativeTitle = hint.nativeTitle;
  if (hint.year && item.year === undefined) patch.year = hint.year;
  if (video && hint.season && item.season !== hint.season) patch.season = hint.season;
  // One file, one named episode: that is the episode, whatever numbering the
  // release name used (absolute numbering is the usual disagreement).
  if (video && context.videoCount === 1 && hint.episodes?.length === 1) {
    const episode = hint.episodes[0];
    if (item.episode !== episode) patch.episode = episode;
    if (item.episodeKind !== 'episode' && item.episodeKind !== 'ova' && item.episodeKind !== 'special') {
      patch.episodeKind = 'episode';
    }
  }
  return patch;
}

/** The exact-match request the metadata pass accepts, or null when the hint has no id. */
export function metadataOverrideFor(
  hint: MediaIngestHint | undefined,
): { provider: 'anilist' | 'jikan'; id: number } | null {
  // AniList first: its answer carries the MAL id too, so one lookup yields both
  // ids and Jimaku gets the exact AniList match it keys on.
  if (hint?.anilistId) return { provider: 'anilist', id: hint.anilistId };
  if (hint?.malId) return { provider: 'jikan', id: hint.malId };
  return null;
}

// ---------------------------------------------------------------------------
// The renderer event
// ---------------------------------------------------------------------------

export type MediaIngestSource = 'watch-folder' | 'qbittorrent' | 'download' | 'acquired';

export interface MediaIngestedItemSummary {
  id: string;
  title: string;
  seriesTitle?: string;
  season?: number;
  episode?: number;
  kind?: MediaKind;
  category?: MediaCategory;
}

export interface MediaIngestedEvent {
  source: MediaIngestSource;
  /** Epoch ms. */
  at: number;
  /** Ids of the items that were newly added. */
  itemIds: string[];
  items: MediaIngestedItemSummary[];
  /** One line's worth: "Frieren · Episode 5" or "Frieren · Episodes 1–12". */
  summary: {
    title: string;
    count: number;
    season?: number;
    episode?: number;
    /** Set when several episodes of one series landed together. */
    episodeEnd?: number;
    kind?: MediaKind;
  };
}

export function summarizeIngested(
  items: readonly MediaItem[],
  source: MediaIngestSource,
  at: number,
): MediaIngestedEvent {
  const summaries: MediaIngestedItemSummary[] = items.map((item) => {
    const entry: MediaIngestedItemSummary = { id: item.id, title: item.title };
    if (item.seriesTitle) entry.seriesTitle = item.seriesTitle;
    if (item.season !== undefined) entry.season = item.season;
    if (item.episode !== undefined) entry.episode = item.episode;
    if (item.kind) entry.kind = item.kind;
    if (item.category) entry.category = item.category;
    return entry;
  });
  const first = items[0];
  const sameSeries = items.length > 0
    && items.every((item) => (item.seriesKey ?? item.seriesTitle) === (first.seriesKey ?? first.seriesTitle)
      && Boolean(first.seriesKey ?? first.seriesTitle));
  const summary: MediaIngestedEvent['summary'] = {
    title: sameSeries ? (first.seriesTitle || first.title) : (first?.title ?? ''),
    count: items.length,
  };
  if (first?.kind) summary.kind = first.kind;
  if (sameSeries) {
    const episodes = items.map((item) => item.episode).filter((n): n is number => typeof n === 'number').sort((a, b) => a - b);
    const seasons = new Set(items.map((item) => item.season).filter((n) => n !== undefined));
    if (seasons.size === 1) summary.season = [...seasons][0];
    if (episodes.length === items.length && episodes.length > 0) {
      summary.episode = episodes[0];
      if (episodes.length > 1 && episodes[episodes.length - 1] !== episodes[0]) {
        summary.episodeEnd = episodes[episodes.length - 1];
      }
    }
  }
  return { source, at, itemIds: items.map((item) => item.id), items: summaries, summary };
}

// ---------------------------------------------------------------------------
// Settings: the watch-folder list
// ---------------------------------------------------------------------------

/**
 * Who put a folder on the list. Anything but `user` was added automatically and
 * is dismissed (remembered as unwanted) rather than merely removed, so it does
 * not come straight back on the next launch.
 */
export type MediaWatchFolderOrigin = 'user' | 'qbittorrent' | 'app-downloads' | 'destination';

export const MEDIA_WATCH_FOLDER_ORIGINS: readonly MediaWatchFolderOrigin[] = [
  'user', 'qbittorrent', 'app-downloads', 'destination',
];

export interface MediaWatchFolder {
  path: string;
  origin: MediaWatchFolderOrigin;
  addedAt: number;
}

export interface MediaIngestSettings {
  version: 1;
  /** "Import finished downloads automatically". Governs the auto-added folders and the qBittorrent poller. */
  autoImport: boolean;
  folders: MediaWatchFolder[];
  /** Path keys of auto-added folders the user removed. */
  dismissed: string[];
}

export function defaultIngestSettings(): MediaIngestSettings {
  return { version: 1, autoImport: true, folders: [], dismissed: [] };
}

/**
 * Reads the persisted document, migrating the single `watchFolder` the media
 * library used to keep into the first entry of the list.
 */
export function normalizeMediaIngestSettings(
  raw: unknown,
  legacyWatchFolder?: string,
  keyOf: (value: string) => string = (value) => ingestPathKey(value),
): MediaIngestSettings {
  const settings = defaultIngestSettings();
  if (!isRecord(raw)) {
    if (legacyWatchFolder && isAbsolutePathLike(legacyWatchFolder)) {
      settings.folders.push({ path: legacyWatchFolder, origin: 'user', addedAt: 0 });
    }
    return settings;
  }
  if (typeof raw.autoImport === 'boolean') settings.autoImport = raw.autoImport;
  const seen = new Set<string>();
  for (const entry of Array.isArray(raw.folders) ? raw.folders : []) {
    if (!isRecord(entry) || typeof entry.path !== 'string' || !isAbsolutePathLike(entry.path.trim())) continue;
    const origin = MEDIA_WATCH_FOLDER_ORIGINS.includes(entry.origin as MediaWatchFolderOrigin)
      ? (entry.origin as MediaWatchFolderOrigin)
      : 'user';
    const key = keyOf(entry.path);
    if (seen.has(key)) continue;
    seen.add(key);
    settings.folders.push({
      path: entry.path.trim(),
      origin,
      addedAt: typeof entry.addedAt === 'number' && Number.isFinite(entry.addedAt) ? entry.addedAt : 0,
    });
  }
  settings.dismissed = [...new Set((Array.isArray(raw.dismissed) ? raw.dismissed : [])
    .filter((value): value is string => typeof value === 'string' && value.length > 0))].slice(0, 200);
  return settings;
}

/** Adds a folder the user chose. Re-adding a dismissed auto folder un-dismisses it. */
export function addWatchFolder(
  settings: MediaIngestSettings,
  folder: string,
  origin: MediaWatchFolderOrigin,
  now: number,
  keyOf: (value: string) => string = (value) => ingestPathKey(value),
): { settings: MediaIngestSettings; added: boolean } {
  const key = keyOf(folder);
  const existing = settings.folders.find((entry) => keyOf(entry.path) === key);
  if (existing) {
    // The user choosing an auto-added folder makes it theirs.
    if (origin === 'user' && existing.origin !== 'user') {
      return {
        settings: {
          ...settings,
          folders: settings.folders.map((entry) => (entry === existing ? { ...entry, origin: 'user' } : entry)),
        },
        added: false,
      };
    }
    return { settings, added: false };
  }
  return {
    settings: {
      ...settings,
      folders: [...settings.folders, { path: folder, origin, addedAt: now }],
      dismissed: settings.dismissed.filter((value) => value !== key),
    },
    added: true,
  };
}

/** Registers an automatically-found folder unless the user dismissed it before. */
export function registerAutoFolder(
  settings: MediaIngestSettings,
  folder: string,
  origin: Exclude<MediaWatchFolderOrigin, 'user'>,
  now: number,
  keyOf: (value: string) => string = (value) => ingestPathKey(value),
): { settings: MediaIngestSettings; added: boolean } {
  if (settings.dismissed.includes(keyOf(folder))) return { settings, added: false };
  // An auto folder already covered by a listed parent adds nothing but a second watcher.
  const key = keyOf(folder);
  if (settings.folders.some((entry) => isPathKeyWithin(key, keyOf(entry.path)))) {
    return { settings, added: false };
  }
  return addWatchFolder(settings, folder, origin, now, keyOf);
}

export function removeWatchFolder(
  settings: MediaIngestSettings,
  folder: string,
  keyOf: (value: string) => string = (value) => ingestPathKey(value),
): MediaIngestSettings {
  const key = keyOf(folder);
  const target = settings.folders.find((entry) => keyOf(entry.path) === key);
  if (!target) return settings;
  return {
    ...settings,
    folders: settings.folders.filter((entry) => entry !== target),
    dismissed: target.origin === 'user' ? settings.dismissed : [...new Set([...settings.dismissed, key])],
  };
}

/** Folders that are actually watched: the user's always, the automatic ones only while auto-import is on. */
export function activeWatchFolders(settings: MediaIngestSettings): MediaWatchFolder[] {
  return settings.folders.filter((entry) => entry.origin === 'user' || settings.autoImport);
}

// ---------------------------------------------------------------------------
// State the settings panel renders
// ---------------------------------------------------------------------------

export type MediaIngestQbitStatus =
  /** Auto-import is off, so nothing is polled. */
  | 'off'
  /** No qBittorrent profile, or no credential for it. */
  | 'not-configured'
  | 'watching'
  | 'unreachable'
  /** The credential was refused. Polling stops rather than risk a WebUI ban. */
  | 'unauthorized';

export interface MediaIngestFolderState extends MediaWatchFolder {
  exists: boolean;
  /** Being watched right now. */
  active: boolean;
}

export interface MediaIngestState {
  autoImport: boolean;
  folders: MediaIngestFolderState[];
  qbit: {
    status: MediaIngestQbitStatus;
    /** Epoch ms of the last successful poll. */
    lastCheckedAt: number | null;
  };
}

// ---------------------------------------------------------------------------
// The handoff ledger — info hash → identity
// ---------------------------------------------------------------------------

export interface MediaIngestLedgerEntry {
  hash: string;
  via: string;
  hint?: MediaIngestHint;
  /** The release name at handoff, used to recognise its files in a watched folder. */
  name?: string;
  savePath?: string;
  createdAt: number;
  ingestedAt?: number;
}

export interface MediaIngestLedger {
  version: 1;
  entries: Record<string, MediaIngestLedgerEntry>;
}

/** How long an entry is kept. Long enough for a slow swarm; short enough not to grow for ever. */
export const LEDGER_TTL_MS = 180 * 24 * 60 * 60 * 1_000;
export const LEDGER_MAX_ENTRIES = 3_000;

export function normalizeLedger(raw: unknown): MediaIngestLedger {
  const ledger: MediaIngestLedger = { version: 1, entries: {} };
  const source = isRecord(raw) && isRecord(raw.entries) ? raw.entries : {};
  for (const [key, value] of Object.entries(source)) {
    if (!isRecord(value)) continue;
    const hash = normalizeInfoHash(value.hash ?? key);
    if (!hash) continue;
    const createdAt = typeof value.createdAt === 'number' && Number.isFinite(value.createdAt) ? value.createdAt : 0;
    const entry: MediaIngestLedgerEntry = {
      hash,
      via: cleanText(value.via, 40) ?? 'unknown',
      createdAt,
    };
    const hint = normalizeIngestHint(value.hint);
    if (hint) entry.hint = hint;
    const name = cleanText(value.name, 500);
    if (name) entry.name = name;
    const savePath = cleanText(value.savePath, 1_024);
    if (savePath) entry.savePath = savePath;
    if (typeof value.ingestedAt === 'number' && Number.isFinite(value.ingestedAt)) entry.ingestedAt = value.ingestedAt;
    ledger.entries[hash] = entry;
  }
  return ledger;
}

export function pruneLedger(ledger: MediaIngestLedger, now: number): MediaIngestLedger {
  const kept = Object.values(ledger.entries)
    .filter((entry) => now - entry.createdAt < LEDGER_TTL_MS)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, LEDGER_MAX_ENTRIES);
  return { version: 1, entries: Object.fromEntries(kept.map((entry) => [entry.hash, entry])) };
}

/**
 * Records handed-off torrents. A later handoff of the same hash refreshes the
 * identity (the user may have re-sent it from a better-identified surface) but
 * keeps the earliest `createdAt` and any `ingestedAt`.
 */
export function recordLedgerEntries(
  ledger: MediaIngestLedger,
  entries: readonly MediaIngestLedgerEntry[],
  now: number,
): MediaIngestLedger {
  const next: MediaIngestLedger = { version: 1, entries: { ...ledger.entries } };
  for (const entry of entries) {
    const hash = normalizeInfoHash(entry.hash);
    if (!hash) continue;
    const previous = next.entries[hash];
    next.entries[hash] = {
      ...entry,
      hash,
      hint: mergeIngestHints(entry.hint, previous?.hint),
      createdAt: previous?.createdAt ?? entry.createdAt,
      ...(previous?.ingestedAt !== undefined ? { ingestedAt: previous.ingestedAt } : {}),
    };
    if (!next.entries[hash].hint) delete next.entries[hash].hint;
  }
  return pruneLedger(next, now);
}

function comparableName(value: string): string {
  return stemOf(value).toLowerCase().replace(/[\s._]+/g, ' ').trim();
}

/**
 * The handoff a file in a watched folder belongs to, when no torrent client can
 * say so — e.g. a Seanime or debrid download that landed in a watched folder.
 * Matched on the recorded destination + release name first, then on the file
 * or its folder carrying the release name.
 */
export function ledgerEntryForPath(
  ledger: MediaIngestLedger,
  filePath: string,
  keyOf: (value: string) => string = (value) => ingestPathKey(value),
): MediaIngestLedgerEntry | undefined {
  const key = keyOf(filePath);
  const parts = filePath.replace(/\\/g, '/').split('/').filter(Boolean);
  const file = comparableName(parts[parts.length - 1] ?? '');
  const parent = comparableName(parts[parts.length - 2] ?? '');
  const candidates = Object.values(ledger.entries)
    .filter((entry) => entry.name)
    .sort((a, b) => b.createdAt - a.createdAt);
  for (const entry of candidates) {
    if (entry.savePath) {
      const root = keyOf(`${entry.savePath.replace(/[\\/]+$/, '')}/${entry.name}`);
      if (isPathKeyWithin(key, root)) return entry;
    }
  }
  for (const entry of candidates) {
    const name = comparableName(entry.name ?? '');
    if (name && (name === file || name === parent)) return entry;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// qBittorrent completion
// ---------------------------------------------------------------------------

/** One torrent as the completion poller sees it. */
export interface QbitTorrentSnapshot {
  hash: string;
  name: string;
  /** qBittorrent's own state string (`uploading`, `stalledUP`, `moving`, …). */
  rawState: string;
  /** 0..1. */
  progress: number;
  savePath: string;
  /** The torrent's file, or its root folder. `''` on builds older than 4.4. */
  contentPath: string;
  category: string;
  tags: string[];
}

/**
 * Finished and sitting at its final location. `moving` and `checking*` are
 * excluded because the files are not where `content_path` says yet.
 */
export function isTorrentComplete(torrent: Pick<QbitTorrentSnapshot, 'progress' | 'rawState'>): boolean {
  if (torrent.progress < 1) return false;
  const state = torrent.rawState;
  if (state === 'moving' || state === 'error' || state === 'missingFiles' || state.startsWith('checking')) return false;
  return true;
}

export interface QbitCompletionPlan {
  /** Newly finished torrents to import now. */
  toIngest: QbitTorrentSnapshot[];
  /** Finished torrents recorded as handled without importing (the first poll's baseline). */
  baseline: string[];
}

/**
 * Which finished torrents to import.
 *
 * The very first successful poll is a baseline: whatever was already finished
 * in the user's client before this feature existed is recorded, not imported —
 * seven old torrents arriving in the library at once is not what anyone asked
 * for. The exception is a torrent this app handed off (it is in the ledger):
 * the user asked for that one. After the baseline every finished torrent that
 * is not yet handled is imported, including ones that finished while the app
 * was closed.
 */
export function planQbitCompletions(
  torrents: readonly QbitTorrentSnapshot[],
  state: { handled: ReadonlySet<string>; baselined: boolean },
  ledgerHashes: ReadonlySet<string>,
  ignoreCategories: ReadonlySet<string> = new Set(),
): QbitCompletionPlan {
  const plan: QbitCompletionPlan = { toIngest: [], baseline: [] };
  for (const torrent of torrents) {
    const hash = torrent.hash.toLowerCase();
    if (!hash || state.handled.has(hash)) continue;
    if (ignoreCategories.has(torrent.category)) continue;
    if (!isTorrentComplete(torrent)) continue;
    if (!state.baselined && !ledgerHashes.has(hash)) plan.baseline.push(hash);
    else plan.toIngest.push(torrent);
  }
  return plan;
}

/** Whether a path belongs to one of these torrents (so the watcher leaves it to the poller). */
export function torrentOwningPath(
  torrents: readonly QbitTorrentSnapshot[],
  filePath: string,
  keyOf: (value: string) => string = (value) => ingestPathKey(value),
): QbitTorrentSnapshot | undefined {
  const key = keyOf(filePath);
  return torrents.find((torrent) => {
    const root = torrent.contentPath
      || (torrent.savePath && torrent.name ? `${torrent.savePath.replace(/[\\/]+$/, '')}/${torrent.name}` : '');
    return Boolean(root) && isPathKeyWithin(key, keyOf(root));
  });
}

// ---------------------------------------------------------------------------
// Bounded "seen" memory for watch folders
// ---------------------------------------------------------------------------

/** Paths a watch folder has already dealt with. Insertion-ordered so the oldest go first. */
export const SEEN_PATHS_LIMIT = 60_000;

export function capSeenPaths(keys: Iterable<string>, limit = SEEN_PATHS_LIMIT): string[] {
  const list = [...new Set(keys)];
  return list.length > limit ? list.slice(list.length - limit) : list;
}
