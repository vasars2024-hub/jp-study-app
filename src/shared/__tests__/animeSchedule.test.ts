/*
 * The airing-schedule -> release matcher.
 *
 * The interesting assertions here are all about what the matcher REFUSES to
 * do. A matcher that attaches something to every row is trivially easy to
 * write and is exactly the defect audit F3 recorded on this surface: an answer
 * from a source other than the one asked for, presented without comment.
 */
import { describe, expect, it } from 'vitest';
import type { TorrentRow } from '../scraperResults';
import {
  entryTitles,
  matchEntry,
  matchScheduleReleases,
  releaseNameCoversEpisode,
  releaseQueryFor,
  summariseSchedule,
  type AiringEntry,
} from '../animeSchedule';

function entry(partial: Partial<AiringEntry> = {}): AiringEntry {
  return {
    mediaId: 1,
    episode: 7,
    airingAt: 1_785_000_000,
    titles: ['Sousou no Frieren', 'Frieren: Beyond Journey’s End', '葬送のフリーレン'],
    displayTitle: 'Sousou no Frieren',
    format: 'TV',
    episodeCount: 28,
    siteUrl: 'https://anilist.co/anime/154587',
    coverUrl: '',
    ...partial,
  };
}

function release(name: string, partial: Partial<TorrentRow> = {}): TorrentRow {
  return {
    id: name,
    infoHash: 'aa11',
    name,
    releaseGroup: 'SubsPlease',
    resolution: '1080p',
    seeders: 100,
    leechers: 2,
    availability: 500,
    tracker: 'Nyaa',
    sizeBytes: 1_400_000_000,
    ageDays: 0,
    fileCount: 1,
    subtitleLanguages: ['en'],
    isBatch: false,
    magnet: 'magnet:?xt=urn:btih:aa11',
    ...partial,
  };
}

describe('matchEntry — the episode number is a hard gate', () => {
  it('refuses a perfect title match on the wrong episode', () => {
    const row = matchEntry(entry({ episode: 7 }), [
      release('[SubsPlease] Sousou no Frieren - 06 (1080p) [ABCD1234].mkv'),
    ]);

    expect(row.release).toBeNull();
    expect(row.disposition).toBe('none');
    expect(row.reason).toBe('no-episode-match');
    // It was considered, and rejected on the episode — not silently unseen.
    expect(row.consideredCount).toBe(1);
    expect(row.episodeMatchCount).toBe(0);
  });

  it('matches the right episode and labels the source', () => {
    const row = matchEntry(entry({ episode: 7 }), [
      release('[SubsPlease] Sousou no Frieren - 07 (1080p) [ABCD1234].mkv'),
    ]);

    expect(row.release).not.toBeNull();
    expect(row.disposition).toBe('exact');
    expect(row.reason).toBe('matched');
    expect(row.releaseSource).toBe('Nyaa');
    expect(row.scheduleSource).toBe('anilist');
  });

  it('treats a release with no readable episode number as covering nothing', () => {
    // Absence is not a wildcard: if this matched, one untagged upload would
    // attach itself to every row in the schedule at once.
    const row = matchEntry(entry(), [release('Sousou no Frieren [Batch] [1080p]')]);
    expect(row.release).toBeNull();
    expect(row.reason).toBe('no-episode-match');
  });
});

describe('matchEntry — batches are opt-in', () => {
  // The bare `01-12` form is the common fansub batch name, and
  // `coveredByBatchRange` (malDownload.ts:437) reads it.
  const batch = release('[Group] Sousou no Frieren - 01-12 [1080p][Batch]', { isBatch: true });

  it('does not count a season pack as the episode by default', () => {
    const row = matchEntry(entry({ episode: 7 }), [batch]);
    expect(row.release).toBeNull();
    expect(row.reason).toBe('no-episode-match');
  });

  it('accepts a covering range when asked to', () => {
    const row = matchEntry(entry({ episode: 7 }), [batch], { allowBatches: true });
    expect(row.release).not.toBeNull();
    expect(row.episodeMatchCount).toBe(1);
  });

  it('still refuses a range that does not cover the episode', () => {
    const row = matchEntry(entry({ episode: 20 }), [batch], { allowBatches: true });
    expect(row.release).toBeNull();
  });

  it('does not let "Batch" in the name stand in for a range it can read', () => {
    // `isBatch` is true here and there is no declared range. "This is a batch"
    // is not "this batch contains episode 7" — accepting on the flag alone is
    // the near-match-presented-as-exact this module exists to prevent.
    const noRange = release('[Group] Sousou no Frieren [Batch][1080p]', { isBatch: true });
    expect(noRange.isBatch).toBe(true);
    const row = matchEntry(entry({ episode: 7 }), [noRange], { allowBatches: true });
    expect(row.release).toBeNull();
    expect(row.reason).toBe('no-episode-match');
  });
});

describe('matchEntry — an unrelated show is not a match', () => {
  it('rejects a right-numbered episode of a different series', () => {
    const row = matchEntry(entry({ episode: 7 }), [
      release('[SubsPlease] Bocchi the Rock! - 07 (1080p) [99887766].mkv'),
    ]);

    // The episode gate passes; the title must be what rejects it.
    expect(row.episodeMatchCount).toBe(1);
    expect(row.release).toBeNull();
    expect(row.reason).toBe('below-confidence');
  });

  it('prefers the better title when several carry the episode number', () => {
    const row = matchEntry(entry({ episode: 7 }), [
      release('[X] Bocchi the Rock! - 07 [1080p].mkv'),
      release('[SubsPlease] Sousou no Frieren - 07 (1080p) [ABCD1234].mkv'),
    ]);
    expect(row.release?.name).toContain('Frieren');
    expect(row.episodeMatchCount).toBe(2);
  });
});

describe('a plausible-but-unproven match is reported as unproven', () => {
  it('reports review, not exact, for a containment-only title match', () => {
    // "Frieren" is contained in "Sousou no Frieren", which scores in the
    // review band — high enough to show, not high enough to assert.
    const row = matchEntry(entry({ episode: 7 }), [
      release('[Group] Frieren - 07 [1080p].mkv'),
    ]);

    expect(row.release).not.toBeNull();
    expect(row.disposition).toBe('review');
    expect(row.disposition).not.toBe('exact');
    expect(row.confidence).toBeGreaterThanOrEqual(0.5);
    expect(row.confidence).toBeLessThan(0.82);
  });
});

describe('the four no-release reasons stay distinct', () => {
  it('separates "index answered with nothing" from "the lookup failed"', () => {
    const answered = matchEntry(entry(), []);
    expect(answered.reason).toBe('no-releases-returned');

    const failed = matchScheduleReleases([entry()], new Map([[1, null]]))[0];
    expect(failed.reason).toBe('search-failed');

    // A row whose key is absent entirely is also a failure, not an empty result.
    const missing = matchScheduleReleases([entry()], new Map())[0];
    expect(missing.reason).toBe('search-failed');
  });

  it('never returns a release on any none disposition', () => {
    const rows = [
      matchEntry(entry(), []),
      matchEntry(entry({ episode: 99 }), [release('[G] Sousou no Frieren - 07 [1080p].mkv')]),
      matchScheduleReleases([entry()], new Map([[1, null]]))[0],
    ];
    for (const row of rows) {
      expect(row.disposition).toBe('none');
      expect(row.release).toBeNull();
      expect(row.releaseSource).toBeNull();
      expect(row.confidence).toBe(0);
    }
  });
});

describe('matchScheduleReleases keys releases per entry', () => {
  it('cannot let one show’s release satisfy another show’s row', () => {
    const frieren = entry({ mediaId: 1, episode: 7 });
    const bocchi = entry({
      mediaId: 2,
      episode: 7,
      titles: ['Bocchi the Rock!'],
      displayTitle: 'Bocchi the Rock!',
    });
    const releases = new Map<number, TorrentRow[]>([
      [1, [release('[SubsPlease] Sousou no Frieren - 07 (1080p) [ABCD1234].mkv')]],
      [2, []],
    ]);

    const rows = matchScheduleReleases([frieren, bocchi], releases);
    expect(rows[0].disposition).toBe('exact');
    expect(rows[1].release).toBeNull();
    expect(rows[1].reason).toBe('no-releases-returned');
  });
});

describe('summary and query helpers', () => {
  it('counts every row into exactly one bucket', () => {
    const rows = matchScheduleReleases(
      [entry({ mediaId: 1 }), entry({ mediaId: 2 }), entry({ mediaId: 3 })],
      new Map<number, TorrentRow[] | null>([
        [1, [release('[SubsPlease] Sousou no Frieren - 07 (1080p) [ABCD1234].mkv')]],
        [2, []],
        [3, null],
      ]),
    );
    const summary = summariseSchedule(rows);
    expect(summary.total).toBe(3);
    expect(summary.exact + summary.review + summary.none).toBe(3);
    expect(summary.searchFailed).toBe(1);
  });

  it('zero-pads the episode into the index query', () => {
    expect(releaseQueryFor(entry({ episode: 7 }))).toBe('Sousou no Frieren 07');
    // Three digits are left alone: no fansub pads past 99.
    expect(releaseQueryFor(entry({ episode: 100 }))).toBe('Sousou no Frieren');
  });

  it('de-duplicates and trims the titles used for matching', () => {
    expect(entryTitles(entry({ titles: ['A ', ' A', 'B', ''] }))).toEqual(['A', 'B']);
  });

  it('covers ranges only when batches are allowed', () => {
    expect(releaseNameCoversEpisode('[G] Title - 07 [1080p].mkv', 7, false)).toBe(true);
    expect(releaseNameCoversEpisode('[G] Title - 01-12 [1080p]', 7, false)).toBe(false);
    expect(releaseNameCoversEpisode('[G] Title - 01-12 [1080p]', 7, true)).toBe(true);
    expect(releaseNameCoversEpisode('[G] Title [1080p]', 7, true)).toBe(false);
    // Forms malDownload's matcher accepts that a naive \b0*N\b would confuse
    // with a resolution or a CRC.
    expect(releaseNameCoversEpisode('[G] Title S01E07 [1080p]', 7, false)).toBe(true);
    expect(releaseNameCoversEpisode('[G] Title [07] [1080p]', 7, false)).toBe(true);
    expect(releaseNameCoversEpisode('[G] Title - 07v2 [1080p]', 7, false)).toBe(true);
  });
});
