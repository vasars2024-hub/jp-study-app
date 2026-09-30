/**
 * The real connectors behind Unified Search (MASTER_PLAN §6).
 *
 * Until these existed every source except the local library was bound to an
 * executor that returned nothing, so a search across "all sources" was a search
 * of the flashcard deck. Two backends already answer real queries in this app,
 * and Unified Search now asks them:
 *
 *   - the public catalogues (MyAnimeList via Jikan, and AniList) through the
 *     Discover search in `main/mediaDiscovery.ts`, for `metadata` providers;
 *   - the torrent indexes the Source Manager lists, through the same search the
 *     Torrent Manager runs, for `site` and `connector` providers.
 *
 * Both are metadata and index listings — nothing here resolves or fetches
 * media, and nothing opens a site the Source Manager does not already list.
 *
 * `mergeUnifiedSearchResults` is the other half: one list across every
 * provider, deduplicated by catalogue id or normalised title, each row carrying
 * the providers that returned it.
 */

import type { UnifiedSearchProvider, UnifiedSearchResult } from '../shared/unifiedSearch';
import type {
  UnifiedSearchProviderExecutor,
  UnifiedSearchProviderProgress,
} from '../shared/unifiedSearchExecution';
import type { DiscoveryCandidate, DiscoveryFeedResult } from '../shared/mediaDiscovery';
import type { TorrentRow } from '../shared/scraperResults';
import type { ScraperTorrentSearchInput } from '../shared/scraperIpc';
import { enabledSourcesOfKind } from '../shared/scraperSourceOrder';
import type { ScraperSettings } from '../shared/scraperSettings';

// ------------------------------------------------------------- built-ins ---

/** Stable ids, so the seeded providers survive reorders and toggles. */
export const BUILT_IN_UNIFIED_SEARCH_PROVIDERS: readonly UnifiedSearchProvider[] = Object.freeze([
  builtIn('local-library', 'Local library', 'local-library', 0),
  builtIn('catalogues', 'MyAnimeList · AniList', 'metadata', 1),
  builtIn('torrent-indexes', 'Torrent indexes', 'site', 2),
  // Dramas and films were missing: the catalogues above are anime/manga only.
  builtIn('tv-film', 'TVmaze · TMDB', 'metadata', 3),
  // "Does this have subtitles?" answered before anything is downloaded.
  builtIn('subtitle-availability', 'Subtitle availability', 'connector', 4),
]);

/** Built-ins added after the first release; appended once to existing documents. */
export const LATER_BUILT_IN_IDS: readonly string[] = ['tv-film', 'subtitle-availability'];

function builtIn(
  id: string,
  name: string,
  kind: UnifiedSearchProvider['kind'],
  priority: number,
): UnifiedSearchProvider {
  return {
    id,
    name,
    kind,
    enabled: true,
    priority,
    groupIds: [],
    supportedLanguages: [],
    definition: {
      endpoint: null,
      method: kind === 'local-library' ? 'local' : 'get',
      selectors: {},
      apiConfiguration: {},
      resultParser: null,
      metadataMapping: {},
    },
  };
}

// --------------------------------------------------------- catalogue side ---

function candidateResult(providerId: string, candidate: DiscoveryCandidate): UnifiedSearchResult {
  const resultId = `${candidate.provider}:${candidate.id}`;
  return {
    id: `${providerId}:${resultId}`,
    providerId,
    providerResultId: resultId,
    title: candidate.title,
    alternativeTitles: [],
    japaneseTitle: candidate.nativeTitle ?? null,
    romajiTitle: null,
    authorsOrStudios: candidate.studio ? [candidate.studio] : [],
    coverUrl: candidate.posterUrl ?? null,
    language: null,
    availability: 'unknown',
    metadataQuality: typeof candidate.rating === 'number' ? Math.round(candidate.rating * 10) : null,
    episodeCount: candidate.episodeCount ?? null,
    trackingStatus: 'unknown',
    mediaType: candidate.mediaType === 'manga' ? 'manga' : 'anime',
    year: candidate.year ?? null,
    season: null,
    genres: candidate.genres ?? [],
  };
}

/**
 * The catalogue connector. A search that no catalogue answered is a failure,
 * not zero results — the provider row then says so instead of "0 results".
 */
export function createCatalogueExecutor(
  search: (query: string) => Promise<DiscoveryFeedResult>,
): UnifiedSearchProviderExecutor {
  return async ({ query, step }) => {
    const answer = await search(query);
    if (!answer.candidates.length && answer.provenance.servedBy === null && answer.provenance.failures.length) {
      throw new Error(`No catalogue answered (${answer.provenance.failures.join(', ')}).`);
    }
    return answer.candidates.map((candidate) => candidateResult(step.providerId, candidate));
  };
}

// ------------------------------------------------------- dramas and films ---

export interface TvFilmHit {
  provider: 'tvmaze' | 'tmdb';
  id: string;
  title: string;
  nativeTitle?: string;
  year?: number;
  posterUrl?: string;
  kind: 'tv' | 'movie';
  genres: string[];
  rating?: number;
  network?: string;
  country?: string;
}

export function createTvFilmExecutor(search: (query: string) => Promise<TvFilmHit[]>): UnifiedSearchProviderExecutor {
  return async ({ query, step }) => {
    const hits = await search(query);
    return hits.map((hit): UnifiedSearchResult => ({
      id: `${step.providerId}:${hit.id}`,
      providerId: step.providerId,
      providerResultId: hit.id,
      title: hit.title,
      alternativeTitles: [],
      japaneseTitle: hit.nativeTitle ?? null,
      romajiTitle: null,
      authorsOrStudios: hit.network ? [hit.network] : [],
      coverUrl: hit.posterUrl ?? null,
      language: null,
      availability: 'unknown',
      metadataQuality: typeof hit.rating === 'number' ? Math.round(hit.rating * 10) : null,
      episodeCount: null,
      trackingStatus: 'unknown',
      mediaType: hit.kind === 'movie' ? 'movie' : 'tv',
      year: hit.year ?? null,
      season: null,
      genres: hit.genres,
    }));
  };
}

// ------------------------------------------------------ subtitle presence ---

export function createSubtitleAvailabilityExecutor(
  search: (query: string) => Promise<Array<{ language: string; releases: number; sample: string[] }> | null>,
): UnifiedSearchProviderExecutor {
  return async ({ query, step }) => {
    const rows = await search(query);
    if (rows === null) throw new Error('Add an OpenSubtitles key in Settings › Subtitles to check availability.');
    return rows.map((row): UnifiedSearchResult => ({
      id: `${step.providerId}:${row.language}:${query}`,
      providerId: step.providerId,
      providerResultId: `subtitles:${row.language}:${query.toLowerCase()}`,
      title: row.sample[0] ?? query,
      alternativeTitles: row.sample.slice(1),
      japaneseTitle: null,
      romajiTitle: null,
      authorsOrStudios: [],
      coverUrl: null,
      language: row.language,
      availability: row.releases > 0 ? 'available' : 'unavailable',
      metadataQuality: null,
      episodeCount: row.releases,
      trackingStatus: 'unknown',
      mediaType: 'other',
      year: null,
      season: null,
      genres: [],
    }));
  };
}

// ----------------------------------------------------------- torrent side ---

function torrentResult(providerId: string, row: TorrentRow): UnifiedSearchResult {
  const resultId = row.infoHash || row.id;
  return {
    id: `${providerId}:${resultId}`,
    providerId,
    providerResultId: resultId,
    title: row.name,
    alternativeTitles: [],
    japaneseTitle: null,
    romajiTitle: null,
    authorsOrStudios: row.releaseGroup ? [row.releaseGroup] : [],
    coverUrl: null,
    language: row.subtitleLanguages[0] ?? null,
    availability: row.seeders > 0 ? 'available' : 'unavailable',
    metadataQuality: null,
    episodeCount: null,
    trackingStatus: 'unknown',
    mediaType: 'anime',
    year: null,
    season: null,
    genres: [],
  };
}

/**
 * The torrent-index connector: the Source Manager's enabled torrent sources,
 * in priority order, with their fallbacks — the same request the Torrent
 * Manager makes, so the two cannot disagree about what an index holds.
 */
export function createTorrentIndexExecutor(
  search: (input: ScraperTorrentSearchInput) => Promise<TorrentRow[]>,
  settings: () => ScraperSettings,
): UnifiedSearchProviderExecutor {
  return async ({ query, step }) => {
    const active = settings();
    const indexers = enabledSourcesOfKind(active.sources, 'torrent');
    if (!indexers.length) throw new Error('No torrent index is enabled in the Source Manager.');
    const rows = await search({
      query: { text: query },
      indexers,
      torrents: active.torrents,
      timeoutMs: active.sources.perSourceTimeoutMs,
      pool: active.sources.entries,
      maxFallbackDepth: active.sources.maxFallbackDepth,
      settings: active,
    });
    return rows.map((row) => torrentResult(step.providerId, row));
  };
}

// ------------------------------------------------------------------ merge ---

export interface UnifiedSearchMergedSource {
  providerId: string;
  providerName: string;
}

export interface UnifiedSearchMergedRow {
  key: string;
  /** The first provider's copy (providers arrive in priority order). */
  result: UnifiedSearchResult;
  sources: readonly UnifiedSearchMergedSource[];
}

/** Lowercase, width-folded, punctuation-free — how two catalogues spell one title alike. */
export function unifiedSearchTitleKey(title: string): string {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * One list across every provider. Two results are the same work when they
 * share a provider result id (the same catalogue entry reached twice) or a
 * normalised title; the merged row keeps the higher-priority provider's copy
 * and lists every provider that returned it.
 */
export function mergeUnifiedSearchResults(
  providers: readonly UnifiedSearchProviderProgress[],
): UnifiedSearchMergedRow[] {
  const rows: { key: string; result: UnifiedSearchResult; sources: UnifiedSearchMergedSource[] }[] = [];
  const byKey = new Map<string, number>();
  for (const provider of providers) {
    for (const result of provider.results) {
      const idKey = `id:${result.providerResultId}`;
      const titleKey = result.unknownSource ? '' : unifiedSearchTitleKey(result.title);
      const keys = [idKey, ...(titleKey ? [`title:${titleKey}`] : [])];
      const existing = keys.map((key) => byKey.get(key)).find((index) => index !== undefined);
      if (existing === undefined) {
        const index = rows.length;
        rows.push({
          key: keys[keys.length - 1],
          result,
          sources: [{ providerId: provider.providerId, providerName: provider.providerName }],
        });
        for (const key of keys) byKey.set(key, index);
        continue;
      }
      const row = rows[existing];
      if (!row.sources.some((source) => source.providerId === provider.providerId)) {
        row.sources.push({ providerId: provider.providerId, providerName: provider.providerName });
      }
      for (const key of keys) if (!byKey.has(key)) byKey.set(key, existing);
    }
  }
  return rows;
}
