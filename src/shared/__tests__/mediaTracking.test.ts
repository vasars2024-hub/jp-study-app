import { describe, expect, it } from 'vitest';
import {
  createEmptyMediaTrackingDocument,
  getMediaTrackingRecord,
  markMediaEpisodesWatched,
  mediaProgressKindForContentType,
  normalizeMediaTrackingDocument,
  removeMediaTrackingRecord,
  setMediaWatched,
  summarizeMediaTrackingProgress,
  upsertMediaTrackingRecord,
  type MediaTrackingRecord,
} from '../mediaTracking';

/** Normalize one loose record and return it (the phase's records are keyed by identity). */
const recordOf = (input: Record<string, unknown>): MediaTrackingRecord => {
  const { value } = normalizeMediaTrackingDocument({ records: [{ identityId: 'mid-0001', ...input }] });
  expect(value.records).toHaveLength(1);
  return value.records[0];
};

describe('mediaProgressKindForContentType', () => {
  it('defaults movies and specials to unit, episodic content to episodic', () => {
    expect(mediaProgressKindForContentType('movie')).toBe('unit');
    expect(mediaProgressKindForContentType('special')).toBe('unit');
    expect(mediaProgressKindForContentType('anime')).toBe('episodic');
    expect(mediaProgressKindForContentType('jdrama')).toBe('episodic');
    expect(mediaProgressKindForContentType('ova')).toBe('episodic');
  });
});

describe('normalizeMediaTrackingDocument', () => {
  it('rejects a non-object and a future version', () => {
    expect(normalizeMediaTrackingDocument(null).value).toEqual(createEmptyMediaTrackingDocument());
    const future = normalizeMediaTrackingDocument({ version: 999, records: [{ identityId: 'mid-x' }] });
    expect(future.value.records).toHaveLength(0);
    expect(future.issues[0].path).toBe('version');
  });

  it('drops records with no identity ID', () => {
    const { value, issues } = normalizeMediaTrackingDocument({ records: [{ status: 'watching' }] });
    expect(value.records).toHaveLength(0);
    expect(issues.some((issue) => issue.message.includes('identity ID'))).toBe(true);
  });

  it('de-duplicates records by identity, keeping the first', () => {
    const { value, issues } = normalizeMediaTrackingDocument({
      records: [
        { identityId: 'mid-a', status: 'watching' },
        { identityId: 'mid-a', status: 'dropped' },
      ],
    });
    expect(value.records).toHaveLength(1);
    expect(value.records[0].status).toBe('watching');
    expect(issues.some((issue) => issue.message.includes('duplicate'))).toBe(true);
  });

  it('clamps unknown enums, rating, and coerces the identity ID', () => {
    const record = recordOf({ identityId: 'MID-0001', status: 'binging', rating: 500 });
    expect(record.identityId).toBe('mid-0001');
    expect(record.status).toBe('planned');
    expect(record.rating).toBe(100);
  });

  it('validates ISO timestamps and never invents them', () => {
    const record = recordOf({ addedAt: '2026-07-23T10:00:00Z', updatedAt: 'not-a-date' });
    expect(record.addedAt).toBe('2026-07-23T10:00:00Z');
    expect(record.updatedAt).toBeNull();
  });

  it('validates schedule fields, including the broadcast weekday', () => {
    const record = recordOf({
      schedule: { status: 'airing', nextEpisodeNumber: 12, episodesPerWeek: 1, broadcastDay: 'FRI', nextAirDate: '2026-08-01' },
    });
    expect(record.schedule).toEqual({
      status: 'airing', nextEpisodeNumber: 12, episodesPerWeek: 1, broadcastDay: 'fri', nextAirDate: '2026-08-01',
    });
    expect(recordOf({ schedule: { broadcastDay: 'someday' } }).schedule.broadcastDay).toBeNull();
  });

  it('keeps dual-subtitle language preferences', () => {
    const record = recordOf({
      preferences: { audioLanguage: 'ja', subtitleLanguage: 'ja', secondarySubtitleLanguage: 'en', subtitleStyle: 'forced' },
    });
    expect(record.preferences).toEqual({
      audioLanguage: 'ja', subtitleLanguage: 'ja', secondarySubtitleLanguage: 'en', subtitleStyle: 'forced',
    });
  });
});

describe('per-content-type progress', () => {
  it('gives movies a unit progress shape regardless of provided episode fields', () => {
    const record = recordOf({ contentType: 'movie', progress: { watchedEpisodes: [{ season: 1, episode: 1 }] } });
    expect(record.progress).toEqual({ kind: 'unit', watched: false });
  });

  it('gives anime an episodic shape with sorted, de-duplicated marks', () => {
    const record = recordOf({
      contentType: 'anime',
      progress: {
        totalEpisodes: 28,
        totalSeasons: 2,
        watchedEpisodes: [
          { season: 2, episode: 1 },
          { season: 1, episode: 3 },
          { season: 1, episode: 1 },
          { season: 1, episode: 1 },
        ],
      },
    });
    expect(record.progress.kind).toBe('episodic');
    if (record.progress.kind !== 'episodic') throw new Error('expected episodic');
    expect(record.progress.watchedEpisodes).toEqual([
      { season: 1, episode: 1 },
      { season: 1, episode: 3 },
      { season: 2, episode: 1 },
    ]);
    expect(record.progress.totalEpisodes).toBe(28);
  });

  it('honors an explicit kind override for an OVA that is really a mini-series', () => {
    const record = recordOf({ contentType: 'special', progress: { kind: 'episodic', totalEpisodes: 4 } });
    expect(record.progress.kind).toBe('episodic');
  });

  it('drops episode marks with no episode number', () => {
    const record = recordOf({ contentType: 'anime', progress: { watchedEpisodes: [{ season: 1 }, { episode: 5 }] } });
    if (record.progress.kind !== 'episodic') throw new Error('expected episodic');
    expect(record.progress.watchedEpisodes).toEqual([{ season: 1, episode: 5 }]);
  });
});

describe('upsert / get / remove', () => {
  it('migrates the legacy item list into the versioned document', () => {
    const migrated = normalizeMediaTrackingDocument({ items: [{ animeId: 'Legacy-A', isFavorite: true, watchedEpisodes: [{ season: 1, episode: 2 }] }] });
    expect(migrated.value.version).toBe(1);
    expect(migrated.value.records[0]).toMatchObject({ identityId: 'legacy-a', contentType: 'anime', favorite: true });
    expect(migrated.value.records[0].progress).toMatchObject({ kind: 'episodic', watchedEpisodes: [{ season: 1, episode: 2 }] });
  });

  it('inserts, replaces by identity, fetches, and removes', () => {
    const empty = createEmptyMediaTrackingDocument();
    const inserted = upsertMediaTrackingRecord(empty, { identityId: 'mid-a', status: 'watching' }).value;
    expect(inserted.records).toHaveLength(1);

    const replaced = upsertMediaTrackingRecord(inserted, { identityId: 'mid-a', status: 'completed' }).value;
    expect(replaced.records).toHaveLength(1);
    expect(getMediaTrackingRecord(replaced, 'MID-A')?.status).toBe('completed');

    const removed = removeMediaTrackingRecord(replaced, 'mid-a');
    expect(removed.records).toHaveLength(0);
    expect(getMediaTrackingRecord(removed, 'mid-a')).toBeNull();
  });
});

describe('episode / watched mutators', () => {
  it('merges episode marks on an episodic record and stays sorted', () => {
    const base = recordOf({ contentType: 'anime', progress: { watchedEpisodes: [{ season: 1, episode: 1 }] } });
    const next = markMediaEpisodesWatched(base, [{ season: 1, episode: 3 }, { season: 1, episode: 1 }]);
    if (next.progress.kind !== 'episodic') throw new Error('expected episodic');
    expect(next.progress.watchedEpisodes).toEqual([{ season: 1, episode: 1 }, { season: 1, episode: 3 }]);
    expect(base.progress).not.toBe(next.progress);
  });

  it('leaves a unit record untouched when marking episodes', () => {
    const movie = recordOf({ contentType: 'movie' });
    expect(markMediaEpisodesWatched(movie, [{ season: 1, episode: 1 }])).toBe(movie);
  });

  it('sets the watched flag on a unit record only', () => {
    const movie = recordOf({ contentType: 'movie' });
    expect(setMediaWatched(movie, true).progress).toEqual({ kind: 'unit', watched: true });
    const anime = recordOf({ contentType: 'anime' });
    expect(setMediaWatched(anime, true)).toBe(anime);
  });
});

describe('summarizeMediaTrackingProgress', () => {
  it('summarizes a movie by its watched flag', () => {
    const unwatched = summarizeMediaTrackingProgress(recordOf({ contentType: 'movie' }));
    expect(unwatched).toMatchObject({ kind: 'unit', watchedCount: 0, totalCount: 1, isComplete: false, completionRatio: 0 });
    const watched = summarizeMediaTrackingProgress(recordOf({ contentType: 'movie', progress: { watched: true } }));
    expect(watched).toMatchObject({ watchedCount: 1, remainingCount: 0, isComplete: true, completionRatio: 1 });
  });

  it('treats a completed-status movie as watched even without the flag', () => {
    const summary = summarizeMediaTrackingProgress(recordOf({ contentType: 'movie', status: 'completed' }));
    expect(summary.isComplete).toBe(true);
  });

  it('computes episodic counts, remaining, ratio, and furthest episode', () => {
    const summary = summarizeMediaTrackingProgress(recordOf({
      contentType: 'anime',
      progress: {
        totalEpisodes: 12,
        watchedEpisodes: [{ season: 1, episode: 1 }, { season: 1, episode: 2 }, { season: 1, episode: 3 }],
      },
    }));
    expect(summary).toEqual({
      kind: 'episodic',
      watchedCount: 3,
      totalCount: 12,
      remainingCount: 9,
      completionRatio: 0.25,
      isComplete: false,
      furthestEpisode: { season: 1, episode: 3 },
    });
  });

  it('leaves ratio and remaining unknown when the total is unknown', () => {
    const summary = summarizeMediaTrackingProgress(recordOf({
      contentType: 'anime',
      progress: { watchedEpisodes: [{ season: 1, episode: 1 }] },
    }));
    expect(summary.totalCount).toBeNull();
    expect(summary.completionRatio).toBeNull();
    expect(summary.remainingCount).toBeNull();
    expect(summary.isComplete).toBe(false);
  });

  it('marks an episodic title complete once watched reaches the total', () => {
    const summary = summarizeMediaTrackingProgress(recordOf({
      contentType: 'anime',
      progress: { totalEpisodes: 2, watchedEpisodes: [{ season: 1, episode: 1 }, { season: 1, episode: 2 }] },
    }));
    expect(summary.isComplete).toBe(true);
    expect(summary.completionRatio).toBe(1);
  });
});
