// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { normalizeMediaProvidersDocument } from '../../shared/mediaProviders';
import { mergeStoredMediaResults } from '../../shared/mediaResultPresentation';
import { EMPTY_UNIFIED_SEARCH_FILTERS } from '../../shared/unifiedSearchManagement';
import { projectMergedResultsIntoUnifiedSearchSession } from '../unifiedSearchMergedAdapter';

const merged = () => mergeStoredMediaResults(normalizeMediaProvidersDocument({
  providers: [
    { id: 'a', name: 'A', priority: 0, reliabilityScore: 80, contentTypes: ['anime', 'movie'] },
    { id: 'b', name: 'B', priority: 1, reliabilityScore: 95, contentTypes: ['anime'] },
  ],
  descriptors: [
    { id: 'a-f', providerId: 'a', providerItemId: 'f', title: 'Frieren', contentType: 'anime', year: 2023, studio: 'A', languages: ['ja'], identifiers: [{ namespace: 'mal', value: '1' }] },
    { id: 'b-f', providerId: 'b', providerItemId: 'f', title: 'Sousou no Frieren', contentType: 'anime', year: 2024, studio: 'B', languages: ['en'], identifiers: [{ namespace: 'mal', value: '1' }] },
    { id: 'movie', providerId: 'a', providerItemId: 'm', title: 'Frieren Movie', contentType: 'movie', availability: 'degraded' },
  ],
}).value);

describe('merged media to Unified Search adapter', () => {
  it('retains identity, provenance, conflicts, and complete source coverage', () => {
    const projection = projectMergedResultsIntoUnifiedSearchSession(
      { generation: 3, query: 'frieren' }, merged(), EMPTY_UNIFIED_SEARCH_FILTERS,
    );
    const anime = projection.partitions.find((partition) => partition.partition === 'anime');
    expect(projection).toMatchObject({ generation: 3, query: 'frieren', resultCount: 2 });
    expect(anime?.sourceProviderIds).toEqual(['a', 'b']);
    expect(anime?.results[0]).toMatchObject({
      identityPartition: 'anime', sourceCount: 2, metadataQuality: 95,
      provenance: { title: 'a-f', studio: 'a-f', year: 'a-f' },
      conflicts: { title: ['Frieren', 'Sousou no Frieren'], studio: ['A', 'B'], year: [2023, 2024] },
    });
    expect(anime?.results[0].sources.map((source) => source.descriptorId)).toEqual(['a-f', 'b-f']);
    expect(anime?.results[0].identifiers).toEqual([{ namespace: 'mal', value: '1' }]);
  });

  it('keeps content-type partitions separate and maps presentation fields without execution', () => {
    const projection = projectMergedResultsIntoUnifiedSearchSession(
      { generation: 1, query: 'frieren' }, merged(), EMPTY_UNIFIED_SEARCH_FILTERS,
    );
    expect(projection.partitions.map((partition) => partition.partition)).toEqual(['anime', 'movie']);
    expect(projection.partitions[1].results[0]).toMatchObject({ mediaType: 'movie', availability: 'partial' });
  });

  it('is deterministic across merged input order and applies existing Unified Search filters', () => {
    const results = merged();
    const filters = { ...EMPTY_UNIFIED_SEARCH_FILTERS, languages: ['ja'] };
    const forward = projectMergedResultsIntoUnifiedSearchSession({ generation: 2, query: 'frieren' }, results, filters);
    const reverse = projectMergedResultsIntoUnifiedSearchSession({ generation: 2, query: 'frieren' }, [...results].reverse(), filters);
    expect(reverse).toEqual(forward);
    expect(forward.partitions.flatMap((partition) => partition.results)).toHaveLength(1);
  });

  it('does not expose stored results before the session has a query', () => {
    expect(projectMergedResultsIntoUnifiedSearchSession(
      { generation: 0, query: '  ' }, merged(), EMPTY_UNIFIED_SEARCH_FILTERS,
    ).partitions).toEqual([]);
  });

  it('projects identity tracking across all merged sources before status filtering', () => {
    const results = merged();
    const anime = results.find((result) => result.contentType === 'anime');
    if (!anime) throw new Error('expected anime identity');
    const tracking = { version: 1 as const, records: [{
      identityId: anime.identityId, contentType: 'anime' as const, status: 'on-hold' as const,
      favorite: false, progress: { kind: 'episodic' as const, watchedEpisodes: [{ season: 1, episode: 4 }], totalEpisodes: 28, totalSeasons: 1 },
      schedule: { status: 'unknown' as const, nextEpisodeNumber: null, nextAirDate: null, episodesPerWeek: null, broadcastDay: null },
      preferences: { audioLanguage: null, subtitleLanguage: null, secondarySubtitleLanguage: null, subtitleStyle: 'full' as const },
      rating: null, notes: '', addedAt: null, updatedAt: null,
    }] };
    const filters = { ...EMPTY_UNIFIED_SEARCH_FILTERS, trackingStatuses: ['paused' as const] };
    const projection = projectMergedResultsIntoUnifiedSearchSession(
      { generation: 4, query: 'frieren' }, results, filters, tracking,
    );
    expect(projection.resultCount).toBe(1);
    expect(projection.partitions[0].results[0]).toMatchObject({
      identityId: anime.identityId,
      sourceCount: 2,
      trackingStatus: 'paused',
      trackingRecord: { status: 'on-hold' },
      trackingProgress: { watchedCount: 1, totalCount: 28 },
    });
  });
});
