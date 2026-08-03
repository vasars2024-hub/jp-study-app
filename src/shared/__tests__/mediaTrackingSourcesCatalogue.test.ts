import { describe, expect, it } from 'vitest';
import { assignTrackingSource, buildTrackingSourceCatalogue, projectMediaTrackingAggregates, createEmptyMediaTrackingSourcesDocument, updateTrackingSourceHealth } from '../mediaTrackingSources';

describe('media tracking source catalogue', () => {
  it('joins local verified sites and providers deterministically', () => {
    expect(buildTrackingSourceCatalogue([{ id: 'site-b', name: 'B', active: true, reliabilityScore: 80 }, { id: 'site-a', name: 'A', active: false, reliabilityScore: null }], [{ id: 'provider-c', name: 'C', enabled: true, reliabilityScore: 90 }]).map((item) => item.sourceId)).toEqual(['site-a', 'site-b', 'provider-c']);
  });

  it('assigns a source and projects aggregate monitoring confidence', () => {
    const source = { sourceId: 'site-a', sourceName: 'A', kind: 'verified-site' as const, enabled: true, reliabilityScore: 80 };
    const first = assignTrackingSource(createEmptyMediaTrackingSourcesDocument(), 'anime-1', source);
    const second = assignTrackingSource({ ...first, rows: [...first.rows, { ...first.rows[0], sourceId: 'site-b', sourceName: 'B', status: 'working' as const, reliabilityScore: 100, newEpisodeDetected: true }] }, 'anime-1', { ...source, sourceId: 'site-b', sourceName: 'B', reliabilityScore: 100 });
    expect(projectMediaTrackingAggregates(second)).toEqual([{ identityId: 'anime-1', monitoredCount: 2, availableCount: 1, newEpisodeCount: 1, confidenceScore: 90, sourceIds: ['site-a', 'site-b'] }]);
  });
  it('updates only the selected row health fields deterministically', () => {
    const source = assignTrackingSource(createEmptyMediaTrackingSourcesDocument(), 'anime-1', { sourceId: 'site-a', sourceName: 'A', kind: 'verified-site', enabled: true, reliabilityScore: null });
    const updated = updateTrackingSourceHealth(source, 'anime-1', 'site-a', { status: 'working', lastCheckedAt: '2026-07-23T10:00:00Z', reliabilityScore: 88, newEpisodeDetected: true, nextEpisodeNumber: 7 });
    expect(updated.rows[0]).toMatchObject({ status: 'working', lastCheckedAt: '2026-07-23T10:00:00.000Z', reliabilityScore: 88, newEpisodeDetected: true, nextEpisodeNumber: 7 });
  });
});
