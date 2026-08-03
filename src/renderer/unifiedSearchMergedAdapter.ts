import type { MergedMediaResult, MediaResultScalarField, MediaResultSource } from '../shared/mediaResultPresentation';
import { presentStoredMediaResults } from '../shared/mediaResultPresentation';
import type { MediaContentType, MediaIdentifierRef } from '../shared/mediaProviders';
import type { UnifiedSearchResult, UnifiedSearchMediaType } from '../shared/unifiedSearch';
import type { UnifiedSearchFilters } from '../shared/unifiedSearchManagement';
import { filterUnifiedSearchResults } from '../shared/unifiedSearchManagement';
import { overlayMediaTracking, type TrackedMergedMediaResult } from '../shared/mediaTrackingOverlay';
import type { MediaTrackingDocument, MediaTrackingProgressSummary, MediaTrackingRecord } from '../shared/mediaTracking';
import type { UnifiedSearchSessionState } from './unifiedSearchSession';

/** A merged result shaped for the existing Unified Search result renderer. */
export interface UnifiedSearchMergedResult extends UnifiedSearchResult {
  identityId: string;
  identityPartition: string;
  contentType: MediaContentType;
  identifiers: readonly MediaIdentifierRef[];
  sources: readonly MediaResultSource[];
  sourceCount: number;
  provenance: Readonly<Partial<Record<MediaResultScalarField, string>>>;
  conflicts: Readonly<Partial<Record<MediaResultScalarField, readonly (string | number)[]>>>;
  trackingRecord: MediaTrackingRecord | null;
  trackingProgress: MediaTrackingProgressSummary | null;
}

export interface UnifiedSearchMergedPartition {
  partition: string;
  contentType: MediaContentType;
  results: readonly UnifiedSearchMergedResult[];
  sourceProviderIds: readonly string[];
}

export interface UnifiedSearchMergedProjection {
  generation: number;
  query: string;
  partitions: readonly UnifiedSearchMergedPartition[];
  resultCount: number;
}

const mediaType = (contentType: MediaContentType): UnifiedSearchMediaType => {
  if (contentType === 'anime' || contentType === 'movie' || contentType === 'tv'
    || contentType === 'ova' || contentType === 'special') return contentType;
  return 'other';
};

const availability = (value: MergedMediaResult['availability']): UnifiedSearchResult['availability'] => {
  if (value === 'degraded') return 'partial';
  return value;
};

function adaptResult(result: TrackedMergedMediaResult): UnifiedSearchMergedResult {
  const trackingStatus = result.tracking.record?.status === 'on-hold'
    ? 'paused'
    : result.tracking.record?.status ?? 'untracked';
  return Object.freeze({
    id: result.identityId,
    providerId: `merged-${result.partition}`,
    providerResultId: result.identityId,
    title: result.title,
    alternativeTitles: result.alternativeTitles,
    japaneseTitle: result.japaneseTitle,
    romajiTitle: result.romajiTitle,
    authorsOrStudios: [result.studio, result.director, ...result.actors]
      .filter((value): value is string => value !== null),
    coverUrl: null,
    language: result.languages[0] ?? null,
    availability: availability(result.availability),
    metadataQuality: result.sources.reduce<number | null>((best, source) => source.reliabilityScore === null
      ? best : Math.max(best ?? 0, source.reliabilityScore), null),
    episodeCount: result.episodeCount,
    trackingStatus,
    mediaType: mediaType(result.contentType),
    year: result.year,
    season: null,
    genres: [],
    identityId: result.identityId,
    identityPartition: result.partition,
    contentType: result.contentType,
    identifiers: result.identifiers,
    sources: result.sources,
    sourceCount: result.sourceCount,
    provenance: result.provenance,
    conflicts: result.conflicts,
    trackingRecord: result.tracking.record,
    trackingProgress: result.tracking.progress,
  });
}

/**
 * Pure offline integration seam from merged §6/§7 results to a search session view.
 * It never starts or registers a provider. A session query merely selects already
 * stored merged records, which remain grouped by their identity partition.
 */
export function projectMergedResultsIntoUnifiedSearchSession(
  session: Pick<UnifiedSearchSessionState, 'generation' | 'query'>,
  mergedResults: readonly MergedMediaResult[],
  filters: Readonly<UnifiedSearchFilters>,
  trackingDocument: MediaTrackingDocument | unknown = { version: 1, records: [] },
): UnifiedSearchMergedProjection {
  const query = session.query.trim().replace(/\s+/g, ' ');
  if (!query) return Object.freeze({ generation: session.generation, query, partitions: Object.freeze([]), resultCount: 0 });

  const presented = presentStoredMediaResults(mergedResults, { query });
  const adapted = filterUnifiedSearchResults(
    overlayMediaTracking(presented, trackingDocument).map(adaptResult), filters,
  ) as UnifiedSearchMergedResult[];
  const byPartition = new Map<string, UnifiedSearchMergedResult[]>();
  adapted.forEach((result) => {
    const bucket = byPartition.get(result.identityPartition);
    if (bucket) bucket.push(result); else byPartition.set(result.identityPartition, [result]);
  });
  const partitions = [...byPartition.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([partition, results]) => {
    const sourceProviderIds = [...new Set(results.flatMap((result) => result.sources.map((source) => source.providerId)))].sort();
    return Object.freeze({ partition, contentType: results[0].contentType, results: Object.freeze(results), sourceProviderIds: Object.freeze(sourceProviderIds) });
  });
  return Object.freeze({ generation: session.generation, query, partitions: Object.freeze(partitions), resultCount: adapted.length });
}
