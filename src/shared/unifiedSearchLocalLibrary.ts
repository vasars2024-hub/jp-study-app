import type {
  UnifiedSearchMediaType,
  UnifiedSearchResult,
  UnifiedSearchTrackingStatus,
} from './unifiedSearch';
import type { UnifiedSearchProviderExecutor } from './unifiedSearchExecution';

/**
 * First real Unified Search connector (MASTER_PLAN §6): the offline-first
 * **local-library** provider. It searches data the user already owns — the
 * flashcard deck / study library — and never touches the network, authenticates,
 * or resolves cross-provider identity. Results stay partitioned under the calling
 * provider; merging waits on the §7 Media Identity Engine.
 *
 * This module is deliberately data-source-agnostic and pure: a caller supplies a
 * snapshot of {@link LocalLibraryEntry} values (the renderer adapts the deck into
 * these), and the executor filters and projects them into `UnifiedSearchResult[]`.
 * Everything here is synchronous, deterministic, and node-testable.
 */

/** A searchable local record, already flattened from whatever store it came from. */
export interface LocalLibraryEntry {
  /** Stable local identifier; becomes the result's `providerResultId`. */
  id: string;
  title: string;
  unknownSource?: boolean;
  alternativeTitles?: readonly string[];
  japaneseTitle?: string | null;
  romajiTitle?: string | null;
  authorsOrStudios?: readonly string[];
  /** Extra free-text tokens (mined words, readings, meanings, file names…). */
  keywords?: readonly string[];
  coverUrl?: string | null;
  language?: string | null;
  metadataQuality?: number | null;
  episodeCount?: number | null;
  trackingStatus?: UnifiedSearchTrackingStatus;
  mediaType?: UnifiedSearchMediaType;
  year?: number | null;
  season?: string | null;
  genres?: readonly string[];
}

export interface LocalLibraryExecutorOptions {
  /** Reads a fresh snapshot per search, so newly added library items are found. */
  getEntries: () => readonly LocalLibraryEntry[] | Promise<readonly LocalLibraryEntry[]>;
  /** Maximum results returned per search. Values outside 1-500 are clamped. */
  limit?: number;
}

const DEFAULT_LIMIT = 50;

function normalizeText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function includesQuery(value: string | null | undefined, query: string): boolean {
  return typeof value === 'string' && value !== '' && normalizeText(value).includes(query);
}

function anyIncludesQuery(values: readonly string[] | undefined, query: string): boolean {
  return values !== undefined && values.some((value) => includesQuery(value, query));
}

/**
 * Ranks how well an entry matches a normalized query. Lower is better; `null`
 * means the entry does not match at all. The tiers keep the strongest textual
 * hits (a title prefix) ahead of incidental keyword hits while staying a pure
 * function of the entry, so ordering is fully deterministic.
 */
export function localLibraryMatchScore(entry: LocalLibraryEntry, normalizedQuery: string): number | null {
  if (normalizedQuery === '') return null;
  const title = entry.unknownSource ? '' : normalizeText(entry.title);
  if (title.startsWith(normalizedQuery)) return 0;
  if (title.includes(normalizedQuery)) return 1;
  if (
    includesQuery(entry.japaneseTitle, normalizedQuery)
    || includesQuery(entry.romajiTitle, normalizedQuery)
    || anyIncludesQuery(entry.alternativeTitles, normalizedQuery)
  ) {
    return 2;
  }
  if (anyIncludesQuery(entry.authorsOrStudios, normalizedQuery)) return 3;
  if (anyIncludesQuery(entry.keywords, normalizedQuery)) return 4;
  return null;
}

/**
 * Filters entries to those matching `query` and returns them ranked by match
 * strength, then by original snapshot order (a stable tiebreak). Deterministic
 * for a given snapshot and query.
 */
export function searchLocalLibraryEntries(
  entries: readonly LocalLibraryEntry[],
  query: string,
  limit = DEFAULT_LIMIT,
): LocalLibraryEntry[] {
  const normalizedQuery = normalizeText(query);
  if (normalizedQuery === '') return [];
  const cap = Math.min(500, Math.max(1, Math.floor(Number.isFinite(limit) ? limit : DEFAULT_LIMIT)));
  return entries
    .map((entry, index) => ({ entry, index, score: localLibraryMatchScore(entry, normalizedQuery) }))
    .filter((candidate): candidate is { entry: LocalLibraryEntry; index: number; score: number } =>
      candidate.score !== null)
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .slice(0, cap)
    .map((candidate) => candidate.entry);
}

/** Projects a local entry into a fully-formed, partitioned search result. */
export function localLibraryEntryToResult(
  entry: LocalLibraryEntry,
  providerId: string,
): UnifiedSearchResult {
  return {
    id: `${providerId}:${entry.id}`,
    providerId,
    providerResultId: entry.id,
    title: entry.title,
    ...(entry.unknownSource ? { unknownSource: true } : {}),
    alternativeTitles: [...(entry.alternativeTitles ?? [])],
    japaneseTitle: entry.japaneseTitle ?? null,
    romajiTitle: entry.romajiTitle ?? null,
    authorsOrStudios: [...(entry.authorsOrStudios ?? [])],
    coverUrl: entry.coverUrl ?? null,
    language: entry.language ?? null,
    // The item is already in the user's library, so it is unconditionally available.
    availability: 'available',
    metadataQuality: entry.metadataQuality ?? null,
    episodeCount: entry.episodeCount ?? null,
    trackingStatus: entry.trackingStatus ?? 'unknown',
    mediaType: entry.mediaType ?? 'other',
    year: entry.year ?? null,
    season: entry.season ?? null,
    genres: [...(entry.genres ?? [])],
  };
}

/**
 * Builds a {@link UnifiedSearchProviderExecutor} bound to a local snapshot source.
 * The returned executor performs no I/O: it reads the injected snapshot, filters
 * it in-process, and resolves partitioned results. It honours the request's
 * `AbortSignal` for parity with networked connectors even though the work is
 * synchronous.
 */
export function createLocalLibraryExecutor(
  options: LocalLibraryExecutorOptions,
): UnifiedSearchProviderExecutor {
  return async ({ query, step, signal }) => {
    if (signal.aborted) return [];
    const entries = await options.getEntries();
    if (signal.aborted) return [];
    const matched = searchLocalLibraryEntries(entries, query, options.limit);
    return matched.map((entry) => localLibraryEntryToResult(entry, step.providerId));
  };
}
