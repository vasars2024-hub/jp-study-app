import { describe, expect, it } from 'vitest';
import { filterMediaTrackingAvailabilityCalendar, projectMediaTrackingAvailabilityCalendar, projectMediaTrackingCalendar } from '../mediaTrackingCalendar';
import { normalizeMediaTrackingDocument } from '../mediaTracking';

describe('media tracking calendar', () => {
  it('projects sorted releases within the selected range', () => {
    const document = normalizeMediaTrackingDocument({
      records: [
        { identityId: 'later', contentType: 'anime', schedule: { nextAirDate: '2026-07-28T10:00:00.000Z', nextEpisodeNumber: 4 } },
        { identityId: 'today', contentType: 'anime', schedule: { nextAirDate: '2026-07-23T10:00:00.000Z', nextEpisodeNumber: 2 } },
        { identityId: 'outside', contentType: 'anime', schedule: { nextAirDate: '2026-08-23T10:00:00.000Z' } },
      ],
    }).value;
    const entries = projectMediaTrackingCalendar(document, 'week', new Date('2026-07-23T08:00:00.000Z'));
    expect(entries.map((entry) => entry.identityId)).toEqual(['today', 'later']);
    expect(entries[0].daysFromNow).toBe(0);
    expect(entries[1].nextEpisodeNumber).toBe(4);
  });

  it('adds local source availability counts without changing schedule order', () => {
    const document = normalizeMediaTrackingDocument({
      records: [{ identityId: 'today', contentType: 'anime', schedule: { nextAirDate: '2026-07-23T10:00:00.000Z' } }],
    }).value;
    const result = projectMediaTrackingAvailabilityCalendar(document, {
      version: 1,
      sourceOrder: [],
      disabledSourceIds: [],
      rows: [
        { identityId: 'today', sourceId: 'a', sourceName: 'A', enabled: true, status: 'working', reliabilityScore: 80, lastCheckedAt: null, newEpisodeDetected: true, nextEpisodeNumber: 2 },
        { identityId: 'today', sourceId: 'b', sourceName: 'B', enabled: true, status: 'failed', reliabilityScore: 20, lastCheckedAt: null, newEpisodeDetected: false, nextEpisodeNumber: null },
      ],
    }, 'today', new Date('2026-07-23T08:00:00.000Z'));
    expect(result[0]).toMatchObject({ workingSourceCount: 1, newEpisodeSourceCount: 1 });
  });

  it('filters the projected availability map by local health signals', () => {
    const entries = [
      { identityId: 'one', status: 'airing' as const, nextEpisodeNumber: 1, nextAirDate: '2026-07-23T10:00:00.000Z', daysFromNow: 0, workingSourceCount: 1, newEpisodeSourceCount: 0 },
      { identityId: 'two', status: 'airing' as const, nextEpisodeNumber: 2, nextAirDate: '2026-07-24T10:00:00.000Z', daysFromNow: 1, workingSourceCount: 0, newEpisodeSourceCount: 1 },
      { identityId: 'three', status: 'airing' as const, nextEpisodeNumber: 3, nextAirDate: '2026-07-25T10:00:00.000Z', daysFromNow: 2, workingSourceCount: 1, newEpisodeSourceCount: 1 },
    ];
    expect(filterMediaTrackingAvailabilityCalendar(entries, 'working').map((entry) => entry.identityId)).toEqual(['one', 'three']);
    expect(filterMediaTrackingAvailabilityCalendar(entries, 'new').map((entry) => entry.identityId)).toEqual(['two', 'three']);
    expect(filterMediaTrackingAvailabilityCalendar(entries, 'both').map((entry) => entry.identityId)).toEqual(['three']);
  });
});
