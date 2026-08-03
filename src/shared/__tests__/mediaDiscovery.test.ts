import { describe, expect, it } from 'vitest';
import {
  buildDiscoveryProfile,
  dedupeDiscoveryCandidates,
  discoveryCandidateId,
  discoveryTitleKey,
  estimateStudyLevel,
  inferLevelFromLibrary,
  rankDiscoveryCandidates,
  scoreDiscoveryCandidate,
  type DiscoveryCandidate,
  type DiscoveryProfile,
} from '../mediaDiscovery';

function candidate(patch: Partial<DiscoveryCandidate> = {}): DiscoveryCandidate {
  return {
    provider: 'jikan',
    id: 1,
    title: 'Test Title',
    genres: [],
    ...patch,
  };
}

const emptyProfile: DiscoveryProfile = {
  level: 'N3',
  genreAffinity: {},
  knownTitleKeys: [],
  preferShort: false,
};

describe('estimateStudyLevel', () => {
  it('puts everyday-register shows in the beginner bands', () => {
    const level = estimateStudyLevel(candidate({ genres: ['Slice of Life', 'Comedy'], format: 'TV' }));
    expect(['N5', 'N4']).toContain(level);
  });

  it('puts institutional/technical register in the advanced bands', () => {
    const level = estimateStudyLevel(candidate({ genres: ['Historical', 'Military', 'Politics'], format: 'TV' }));
    expect(['N2', 'N1']).toContain(level);
  });

  it('falls back to the middle band when no genre is recognised', () => {
    expect(estimateStudyLevel(candidate({ genres: ['Nonexistent Genre'] }))).toBe('N3');
  });

  it('is case- and whitespace-insensitive about genre names', () => {
    const a = estimateStudyLevel(candidate({ genres: ['slice of life'] }));
    const b = estimateStudyLevel(candidate({ genres: ['  Slice Of Life  '] }));
    expect(a).toBe(b);
  });
});

describe('scoreDiscoveryCandidate', () => {
  it('scores a title one band above the learner higher than one four bands above', () => {
    const profile = { ...emptyProfile, level: 'N5' as const };
    const easy = scoreDiscoveryCandidate(candidate({ genres: ['Comedy', 'School'] }), profile);
    const hard = scoreDiscoveryCandidate(candidate({ genres: ['Politics', 'Medical'] }), profile);
    expect(easy.matchScore).toBeGreaterThan(hard.matchScore);
  });

  it('rewards genres the learner already watches', () => {
    const profile: DiscoveryProfile = { ...emptyProfile, genreAffinity: { sports: 1 } };
    const withAffinity = scoreDiscoveryCandidate(candidate({ genres: ['Sports'] }), profile);
    const without = scoreDiscoveryCandidate(candidate({ genres: ['Sports'] }), emptyProfile);
    expect(withAffinity.matchScore).toBeGreaterThan(without.matchScore);
    expect(withAffinity.reasons.some((r) => r.code === 'genre-affinity' && r.detail === 'Sports')).toBe(true);
  });

  it('penalises titles already in the library and says so', () => {
    const profile: DiscoveryProfile = { ...emptyProfile, knownTitleKeys: [discoveryTitleKey('Test Title')] };
    const owned = scoreDiscoveryCandidate(candidate(), profile);
    const fresh = scoreDiscoveryCandidate(candidate(), emptyProfile);
    expect(owned.inLibrary).toBe(true);
    expect(owned.matchScore).toBeLessThan(fresh.matchScore);
    expect(owned.reasons.some((r) => r.code === 'already-in-library')).toBe(true);
  });

  it('matches a library entry stored under the native title', () => {
    const profile: DiscoveryProfile = { ...emptyProfile, knownTitleKeys: [discoveryTitleKey('進撃の巨人')] };
    const entry = scoreDiscoveryCandidate(
      candidate({ title: 'Attack on Titan', nativeTitle: '進撃の巨人' }),
      profile,
    );
    expect(entry.inLibrary).toBe(true);
  });

  it('prefers short runs for beginners and does not punish them for advanced learners', () => {
    const beginner: DiscoveryProfile = { ...emptyProfile, level: 'N5', preferShort: true };
    const advanced: DiscoveryProfile = { ...emptyProfile, level: 'N1', preferShort: false };
    const long = candidate({ genres: ['Comedy'], episodeCount: 500 });
    const short = candidate({ genres: ['Comedy'], episodeCount: 12 });
    expect(scoreDiscoveryCandidate(short, beginner).matchScore)
      .toBeGreaterThan(scoreDiscoveryCandidate(long, beginner).matchScore);
    expect(scoreDiscoveryCandidate(long, advanced).reasons.some((r) => r.code === 'long-commitment')).toBe(true);
  });

  it('treats a missing provider score as neutral, not as a zero', () => {
    const unrated = scoreDiscoveryCandidate(candidate({ genres: ['Comedy'] }), emptyProfile);
    const badlyRated = scoreDiscoveryCandidate(candidate({ genres: ['Comedy'], rating: 4 }), emptyProfile);
    expect(unrated.matchScore).toBeGreaterThan(badlyRated.matchScore);
  });

  it('keeps every score inside 0–100', () => {
    const profile: DiscoveryProfile = {
      level: 'N5',
      genreAffinity: { comedy: 1, school: 1, romance: 1 },
      knownTitleKeys: [],
      preferShort: true,
    };
    const best = scoreDiscoveryCandidate(
      candidate({ genres: ['Comedy', 'School', 'Romance'], rating: 10, episodeCount: 12 }),
      profile,
    );
    const worst = scoreDiscoveryCandidate(
      candidate({ genres: ['Politics'], rating: 0, episodeCount: 900 }),
      { ...profile, knownTitleKeys: [discoveryTitleKey('Test Title')] },
    );
    expect(best.matchScore).toBeLessThanOrEqual(100);
    expect(worst.matchScore).toBeGreaterThanOrEqual(0);
  });
});

describe('buildDiscoveryProfile', () => {
  it('weights genres by how often they appear, peaking at 1', () => {
    const profile = buildDiscoveryProfile(
      [
        { title: 'A', genres: ['Comedy', 'School'] },
        { title: 'B', genres: ['Comedy'] },
        { title: 'C', genres: ['Comedy'] },
      ],
      'N4',
    );
    expect(profile.genreAffinity.comedy).toBe(1);
    expect(profile.genreAffinity.school).toBeCloseTo(1 / 3);
  });

  it('collects normalized title keys and flags short-form preference below N3', () => {
    const beginner = buildDiscoveryProfile([{ title: 'Yuru Camp△' }], 'N5');
    expect(beginner.knownTitleKeys).toContain(discoveryTitleKey('Yuru Camp△'));
    expect(beginner.preferShort).toBe(true);
    expect(buildDiscoveryProfile([], 'N2').preferShort).toBe(false);
  });

  it('survives an empty library', () => {
    const profile = buildDiscoveryProfile([], 'N3');
    expect(profile.genreAffinity).toEqual({});
    expect(profile.knownTitleKeys).toEqual([]);
  });
});

describe('inferLevelFromLibrary', () => {
  it('returns the most common stored band', () => {
    expect(inferLevelFromLibrary([
      { jlptLevel: 'N4' },
      { jlptLevel: 'n4' },
      { jlptLevel: 'N1' },
    ])).toBe('N4');
  });

  it('returns null when nothing usable is stored', () => {
    expect(inferLevelFromLibrary([{ jlptLevel: 'B2' }, {}])).toBeNull();
  });
});

describe('dedupeDiscoveryCandidates', () => {
  it('keeps the richer record when both providers return the same title', () => {
    const sparse = candidate({ provider: 'anilist', id: 9, title: 'Frieren' });
    const rich = candidate({
      provider: 'jikan',
      id: 5,
      title: 'frieren',
      synopsis: 'x',
      posterUrl: 'y',
      genres: ['Adventure'],
      episodeCount: 28,
      rating: 9.3,
      studio: 'Madhouse',
    });
    const merged = dedupeDiscoveryCandidates([sparse, rich]);
    expect(merged).toHaveLength(1);
    expect(discoveryCandidateId(merged[0])).toBe('jikan:5');
  });

  it('does not merge distinct titles', () => {
    expect(dedupeDiscoveryCandidates([
      candidate({ id: 1, title: 'One' }),
      candidate({ id: 2, title: 'Two' }),
    ])).toHaveLength(2);
  });
});

describe('rankDiscoveryCandidates', () => {
  const list = [
    candidate({ id: 1, title: 'Heavy', genres: ['Politics', 'Military'], rating: 9 }),
    candidate({ id: 2, title: 'Gentle', genres: ['Slice of Life', 'Comedy'], rating: 8, episodeCount: 12 }),
    candidate({ id: 3, title: 'Owned', genres: ['Comedy'], rating: 8 }),
  ];

  it('sorts best-first for the profile', () => {
    const ranked = rankDiscoveryCandidates(list, { ...emptyProfile, level: 'N5', preferShort: true });
    expect(ranked[0].candidate.title).toBe('Gentle');
  });

  it('honours limit, hideInLibrary and maxLevelGap', () => {
    const profile: DiscoveryProfile = {
      ...emptyProfile,
      level: 'N5',
      knownTitleKeys: [discoveryTitleKey('Owned')],
    };
    expect(rankDiscoveryCandidates(list, profile, { limit: 1 })).toHaveLength(1);
    expect(rankDiscoveryCandidates(list, profile, { hideInLibrary: true })
      .some((r) => r.candidate.title === 'Owned')).toBe(false);
    expect(rankDiscoveryCandidates(list, profile, { maxLevelGap: 1 })
      .some((r) => r.candidate.title === 'Heavy')).toBe(false);
  });

  it('is deterministic across runs', () => {
    const a = rankDiscoveryCandidates(list, emptyProfile).map((r) => r.candidate.id);
    const b = rankDiscoveryCandidates([...list].reverse(), emptyProfile).map((r) => r.candidate.id);
    expect(a).toEqual(b);
  });
});
