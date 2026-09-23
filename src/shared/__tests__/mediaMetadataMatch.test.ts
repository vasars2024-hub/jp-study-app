import { describe, expect, it } from 'vitest';
import {
  METADATA_ACCEPT_CONFIDENCE,
  METADATA_REVIEW_CONFIDENCE,
  formatFromReleaseKind,
  metadataMatchDisposition,
  pickMetadataMatch,
  scoreMetadataCandidate,
  titleSimilarity,
  type MetadataCandidate,
} from '../mediaMetadataMatch';

const candidate = (titles: string[], extra: Partial<MetadataCandidate> = {}): MetadataCandidate => ({
  titles,
  ...extra,
});

describe('titleSimilarity', () => {
  it('scores an exact match 1 regardless of case and punctuation', () => {
    expect(titleSimilarity('The Big O', 'the big o')).toBe(1);
    expect(titleSimilarity('The Big O', 'The Big O!')).toBe(1);
  });

  it('never lets a containment match outrank an exact one', () => {
    const exact = titleSimilarity('The Big O', 'The Big O');
    const sequel = titleSimilarity('The Big O', 'The Big O II');
    expect(sequel).toBeLessThan(exact);
    expect(sequel).toBeGreaterThan(0.5);
  });

  it('falls back to token overlap for reordered titles', () => {
    const score = titleSimilarity('Cowboy Bebop', 'Bebop Cowboy');
    expect(score).toBeGreaterThan(0.3);
    expect(score).toBeLessThan(1);
  });

  it('accepts the same words in another order — romaji family-name order', () => {
    // `Hanzawa Naoki` on the file, `Naoki Hanzawa` on TVmaze.
    const score = titleSimilarity('Hanzawa Naoki', 'Naoki Hanzawa');
    expect(score).toBeGreaterThanOrEqual(0.82);
    expect(score).toBeLessThan(titleSimilarity('Naoki Hanzawa', 'Naoki Hanzawa'));
  });

  it('scores unrelated titles at or near zero', () => {
    expect(titleSimilarity('The Big O', 'Frieren')).toBe(0);
  });

  it('is 0 for empty or unusable input', () => {
    expect(titleSimilarity('', 'The Big O')).toBe(0);
    expect(titleSimilarity('The Big O', '   ')).toBe(0);
  });
});

describe('scoreMetadataCandidate', () => {
  const target = { title: 'The Big O', year: 1999, episodeCount: 26, format: 'tv' };

  it('accepts an exact title with agreeing year', () => {
    const match = scoreMetadataCandidate(target, candidate(['The Big O'], { year: 1999, format: 'TV' }));
    expect(match.confidence).toBeGreaterThanOrEqual(METADATA_ACCEPT_CONFIDENCE);
    expect(match.reasons).toContain('title-exact');
    expect(match.reasons).toContain('year-match');
  });

  it('picks the best of several provider aliases and reports which', () => {
    const match = scoreMetadataCandidate(target, candidate(['THE ビッグオー', 'The Big O', 'Big O']));
    expect(match.matchedTitle).toBe('The Big O');
    expect(match.reasons).toContain('title-exact');
  });

  it('does not let a year clash reject a plainly matching title', () => {
    const match = scoreMetadataCandidate(target, candidate(['The Big O'], { year: 2003 }));
    expect(match.reasons).toContain('year-mismatch');
    expect(match.confidence).toBeGreaterThanOrEqual(METADATA_REVIEW_CONFIDENCE);
  });

  it('does not let a matching year rescue a mismatched title', () => {
    const match = scoreMetadataCandidate(target, candidate(['Frieren'], { year: 1999, format: 'TV' }));
    expect(match.confidence).toBeLessThan(METADATA_REVIEW_CONFIDENCE);
  });

  it('treats a part-watched library as normal, not as a mismatch', () => {
    // 7 files on disk, 26 published episodes — the everyday case.
    const match = scoreMetadataCandidate(
      { ...target, episodeCount: 7 },
      candidate(['The Big O'], { year: 1999, episodeCount: 26, format: 'TV' }),
    );
    expect(match.reasons).not.toContain('episode-count-far');
    expect(match.confidence).toBeGreaterThanOrEqual(METADATA_ACCEPT_CONFIDENCE);
  });

  it('penalizes a wildly larger local count', () => {
    const match = scoreMetadataCandidate(
      { ...target, episodeCount: 60 },
      candidate(['The Big O'], { episodeCount: 13 }),
    );
    expect(match.reasons).toContain('episode-count-far');
  });

  it('clamps confidence into 0..1', () => {
    const match = scoreMetadataCandidate(target, candidate(['The Big O'], {
      year: 1999, format: 'tv', episodeCount: 26,
    }));
    expect(match.confidence).toBeLessThanOrEqual(1);
    expect(match.confidence).toBeGreaterThanOrEqual(0);
  });
});

describe('pickMetadataMatch', () => {
  const target = { title: 'The Big O', year: 1999 };

  it('prefers the exact title over a sequel that contains it', () => {
    const best = pickMetadataMatch(target, [
      candidate(['The Big O II'], { year: 2003, popularity: 900 }),
      candidate(['The Big O'], { year: 1999, popularity: 100 }),
    ]);
    expect(best?.matchedTitle).toBe('The Big O');
  });

  it('returns null when nothing clears the review floor', () => {
    expect(pickMetadataMatch(target, [candidate(['Frieren']), candidate(['Monster'])])).toBeNull();
  });

  it('returns null for an empty candidate list', () => {
    expect(pickMetadataMatch(target, [])).toBeNull();
  });

  it('breaks an exact tie on popularity, then on the shorter title', () => {
    const byPopularity = pickMetadataMatch({ title: 'Gamma' }, [
      candidate(['Gamma'], { popularity: 10 }),
      candidate(['Gamma'], { popularity: 99 }),
    ]);
    expect(byPopularity?.candidate.popularity).toBe(99);

    const byLength = pickMetadataMatch({ title: 'the big o' }, [
      candidate(['The Big O (1999)']),
      candidate(['The Big O']),
    ]);
    expect(byLength?.matchedTitle).toBe('The Big O');
  });
});

describe('acceptance: the real AniList response for "The Big O"', () => {
  // Captured from graphql.anilist.co. The point of this fixture is the second
  // entry: a search for the 1999 show also returns its 2003 sequel, whose romaji
  // title ("THE Big O (2003)") contains the query verbatim. Picking that one
  // would give the user the wrong artwork, synopsis and episode titles.
  const results: MetadataCandidate[] = [
    { titles: ['The Big O', 'THE Big O', 'THEビッグオー'], year: 1999, format: 'TV', episodeCount: 13, popularity: 74 },
    { titles: ['The Big O II', 'THE Big O (2003)', 'THEビッグオー (2003)'], year: 2003, format: 'TV', episodeCount: 13, popularity: 73 },
    { titles: ['Pleasant Goat and Big Big Wolf', 'Xi Yangyang Yu Hui Tailang'], year: 2005, format: 'TV_SHORT', episodeCount: 530, popularity: 56 },
    { titles: ['Kyonyuu Daikazoku Saimin', '巨乳大家族催眠'], year: 2017, format: 'OVA', episodeCount: 2, popularity: 65 },
    { titles: ['Big X', 'ビッグX'], year: 1964, format: 'TV', episodeCount: 59, popularity: 52 },
  ];

  // What the import parser produces for the user's folder: 7 episode files, no
  // year in the names, recognised as episodes.
  const target = { title: 'The Big O', year: null, episodeCount: 7, format: 'tv' };

  it('picks the 1999 series, not the 2003 sequel', () => {
    const best = pickMetadataMatch(target, results);
    expect(best?.candidate.year).toBe(1999);
    expect(best?.matchedTitle).toBe('The Big O');
  });

  it('is confident enough to apply without flagging for review', () => {
    const best = pickMetadataMatch(target, results);
    expect(metadataMatchDisposition(best?.confidence ?? 0)).toBe('accept');
  });

  it('scores the sequel well below the accept threshold', () => {
    const sequel = scoreMetadataCandidate(target, results[1]);
    expect(sequel.confidence).toBeLessThan(METADATA_ACCEPT_CONFIDENCE);
  });

  it('rejects every unrelated result outright', () => {
    for (const unrelated of results.slice(2)) {
      expect(metadataMatchDisposition(scoreMetadataCandidate(target, unrelated).confidence)).toBe('reject');
    }
  });
});

describe('disposition thresholds', () => {
  it('splits accept / review / reject', () => {
    expect(metadataMatchDisposition(0.95)).toBe('accept');
    expect(metadataMatchDisposition(METADATA_ACCEPT_CONFIDENCE)).toBe('accept');
    expect(metadataMatchDisposition(0.6)).toBe('review');
    expect(metadataMatchDisposition(METADATA_REVIEW_CONFIDENCE)).toBe('review');
    expect(metadataMatchDisposition(0.2)).toBe('reject');
  });
});

describe('formatFromReleaseKind', () => {
  it('maps local release kinds onto provider format words', () => {
    expect(formatFromReleaseKind('episode')).toBe('tv');
    expect(formatFromReleaseKind('season-pack')).toBe('tv');
    expect(formatFromReleaseKind('movie')).toBe('movie');
    expect(formatFromReleaseKind('ova')).toBe('ova');
    expect(formatFromReleaseKind('special')).toBe('special');
    expect(formatFromReleaseKind('unknown')).toBeNull();
    expect(formatFromReleaseKind(undefined)).toBeNull();
  });
});
