/*
 * The retry back-off, and the two ways it used to swallow a search.
 *
 * Found live: Jimaku has `The Big O.E13.Bandai.ja.srt`, the local file is
 * episode 13, an API key was configured — and discovery attached nothing and
 * recorded no reason. The cause was not matching at all. The item carried a
 * `no-key` failure from a sweep 5.98 days earlier, the window is 7 days, so the
 * provider was skipped before it was ever asked. `force: true` did not help,
 * because the back-off ignored it.
 *
 * Both are about the same thing: a back-off is only allowed to suppress a
 * search when the previous attempt was *evidence* about the content.
 */
import { describe, expect, it } from 'vitest';
import { __subtitleDiscoveryTestables } from '../subtitleDiscovery';
import type { ProviderSubtitleCandidate } from '../subtitleProviderClients';
import type { MediaItem } from '../../shared/types';

const { scoreCandidates, recentlyFailed } = __subtitleDiscoveryTestables as {
  scoreCandidates: (
    candidates: readonly ProviderSubtitleCandidate[],
    item: MediaItem,
    language: string,
    minConfidence: number,
  ) => { candidate: ProviderSubtitleCandidate; score: number }[];
  recentlyFailed: (
    item: MediaItem,
    providerId: string,
    lang: string,
    retryAfterDays: number,
  ) => boolean;
};

const DAY = 24 * 60 * 60 * 1000;

function itemWith(failures: { providerId: string; lang: string; reason: string; ageDays: number }[]): MediaItem {
  return {
    id: 'item-1',
    title: 'The Big O - 13',
    seriesTitle: 'The Big O',
    seriesKey: 'the big o',
    fileName: 'The Big O - 13 [BDRip 1440x1080 x265 FLAC].mkv',
    path: 'C:/media/The Big O - 13.mkv',
    addedAt: 0,
    episode: 13,
    anilistId: 567,
    subtitleFailures: failures.map((failure) => ({
      providerId: failure.providerId,
      lang: failure.lang,
      reason: failure.reason,
      attemptedAt: Date.now() - failure.ageDays * DAY,
    })),
  } as unknown as MediaItem;
}

describe('recentlyFailed', () => {
  it('does not let a missing API key suppress the search that a new key enables', () => {
    const item = itemWith([{ providerId: 'jimaku', lang: 'ja', reason: 'no-key', ageDays: 5.98 }]);
    expect(recentlyFailed(item, 'jimaku', 'ja', 7)).toBe(false);
  });

  // The back-off still has to work, or every sweep re-asks a provider that has
  // already said no — which is the cost this whole mechanism exists to avoid.
  it('still suppresses a real search that came back empty', () => {
    const item = itemWith([{ providerId: 'jimaku', lang: 'ja', reason: 'no-match', ageDays: 1 }]);
    expect(recentlyFailed(item, 'jimaku', 'ja', 7)).toBe(true);
  });

  it('lets a real failure expire once the window passes', () => {
    const item = itemWith([{ providerId: 'jimaku', lang: 'ja', reason: 'no-match', ageDays: 9 }]);
    expect(recentlyFailed(item, 'jimaku', 'ja', 7)).toBe(false);
  });

  it('keeps failures separate per provider and language', () => {
    const item = itemWith([{ providerId: 'jimaku', lang: 'ja', reason: 'no-match', ageDays: 1 }]);
    expect(recentlyFailed(item, 'opensubtitles', 'ja', 7)).toBe(false);
    expect(recentlyFailed(item, 'jimaku', 'en', 7)).toBe(false);
  });
});

describe('scoring the real Jimaku candidate', () => {
  /** Exactly what `jimakuSearch` builds for this file. */
  const candidate: ProviderSubtitleCandidate = {
    providerId: 'jimaku',
    providerItemId: 'jimaku:1178:The Big O.E13.Bandai.ja.srt',
    language: 'ja',
    format: 'srt',
    releaseName: 'The Big O.E13.Bandai.ja.srt',
    season: null,
    // `episodeFromName` cannot read `.E13.`; this is the requested-episode
    // fallback, which is what makes the match work.
    episode: 13,
    releaseGroup: null,
    hearingImpaired: false,
    hashMatch: false,
    downloads: null,
    fetchToken: 'https://example.test/x.srt',
  };

  it('accepts the file that live discovery was skipping', () => {
    const scored = scoreCandidates([candidate], itemWith([]), 'ja', 70);
    expect(scored).toHaveLength(1);
    expect(scored[0].score).toBeGreaterThanOrEqual(70);
  });

  it('rejects the same file when it is for another episode', () => {
    const scored = scoreCandidates([{ ...candidate, episode: 4 }], itemWith([]), 'ja', 70);
    expect(scored).toHaveLength(0);
  });
});

/*
 * The third way it swallowed a search, and the one that was still live.
 *
 * `jimakuSearch` drops the `down` flag its own client computes, so
 * `discoverForItem` — its only caller — saw an empty array for a 429, a 5xx and
 * a timeout alike and recorded `no-match`: a claim about the show, made out of
 * an outage. `no-match` is evidential, so that claim then suppressed the retry
 * for the whole 7-day window. The real library carries 52 jimaku `no-match`
 * rows for The Big O, a series jimaku demonstrably has per-episode files for.
 */
describe('recentlyFailed — a provider outage', () => {
  it('does not let an outage suppress the retry', () => {
    const item = itemWith([{ providerId: 'jimaku', lang: 'ja', reason: 'provider-down', ageDays: 0.01 }]);
    expect(recentlyFailed(item, 'jimaku', 'ja', 7)).toBe(false);
  });

  // The control: the same age and the same provider, with the reason that IS
  // evidence about the catalogue, must still suppress. Without this the test
  // above would pass on a back-off that had simply stopped working.
  it('still suppresses when the provider actually answered with nothing', () => {
    const item = itemWith([{ providerId: 'jimaku', lang: 'ja', reason: 'no-match', ageDays: 0.01 }]);
    expect(recentlyFailed(item, 'jimaku', 'ja', 7)).toBe(true);
  });

  it('is unaffected by how the multi-language failure row is keyed', () => {
    const item = itemWith([{ providerId: 'opensubtitles', lang: 'ja,en', reason: 'provider-down', ageDays: 0.01 }]);
    expect(recentlyFailed(item, 'opensubtitles', 'ja,en', 7)).toBe(false);
  });
});
