import { describe, expect, it } from 'vitest';
import {
  compareSubtitleQuality,
  createEmptySubtitleQualityRatings,
  gradeSubtitleQuality,
  normalizeSubtitleQualityRatings,
  scoreSubtitleQuality,
  SUBTITLE_QUALITY_DIMENSIONS,
} from '../subtitleQuality';

describe('normalizeSubtitleQualityRatings', () => {
  it('clamps to 0-100, rounds to one decimal, and drops non-numbers', () => {
    const ratings = normalizeSubtitleQualityRatings({
      accuracy: 140,
      syncQuality: -20,
      translationQuality: 77.77,
      completeness: 'great',
      userRating: Number.NaN,
    });
    expect(ratings.accuracy).toBe(100);
    expect(ratings.syncQuality).toBe(0);
    expect(ratings.translationQuality).toBe(77.8);
    expect(ratings.completeness).toBeNull();
    expect(ratings.userRating).toBeNull();
  });

  it('treats a non-object as fully unrated and ignores unknown dimensions', () => {
    expect(normalizeSubtitleQualityRatings(null)).toEqual(createEmptySubtitleQualityRatings());
    const ratings = normalizeSubtitleQualityRatings({ accuracy: 50, vibes: 100 });
    expect(Object.keys(ratings).sort()).toEqual([...SUBTITLE_QUALITY_DIMENSIONS].sort());
  });
});

describe('scoreSubtitleQuality', () => {
  it('scores an unrated release as null/unrated rather than zero', () => {
    const result = scoreSubtitleQuality({});
    expect(result.score).toBeNull();
    expect(result.grade).toBe('unrated');
    expect(result.ratedDimensions).toEqual([]);
    expect(result.missingDimensions).toHaveLength(SUBTITLE_QUALITY_DIMENSIONS.length);
  });

  it('re-normalizes weights across the rated subset', () => {
    // Only accuracy is known, so the composite is exactly that accuracy.
    const single = scoreSubtitleQuality({ accuracy: 82 });
    expect(single.score).toBe(82);
    expect(single.contributions).toHaveLength(1);
    expect(single.contributions[0].normalizedWeight).toBe(1);
  });

  it('weights accuracy above user rating', () => {
    const accurate = scoreSubtitleQuality({ accuracy: 100, userRating: 0 });
    const popular = scoreSubtitleQuality({ accuracy: 0, userRating: 100 });
    expect(accurate.score).toBeGreaterThan(popular.score as number);
    // 0.3 and 0.1 re-normalized over the pair -> 75 / 25.
    expect(accurate.score).toBe(75);
    expect(popular.score).toBe(25);
  });

  it('falls back to an even average when every weight is unusable', () => {
    const result = scoreSubtitleQuality(
      { accuracy: 100, syncQuality: 0 },
      { accuracy: 0, syncQuality: -1, translationQuality: 0, completeness: 0, userRating: 0 },
    );
    expect(result.score).toBe(50);
    expect(result.contributions.map((entry) => entry.normalizedWeight)).toEqual([0.5, 0.5]);
  });

  it('is deterministic across repeated calls', () => {
    const input = { accuracy: 91, syncQuality: 88, completeness: 70 };
    expect(scoreSubtitleQuality(input)).toEqual(scoreSubtitleQuality(input));
  });
});

describe('gradeSubtitleQuality', () => {
  it('bands scores and treats null as unrated', () => {
    expect(gradeSubtitleQuality(null)).toBe('unrated');
    expect(gradeSubtitleQuality(0)).toBe('poor');
    expect(gradeSubtitleQuality(39.9)).toBe('poor');
    expect(gradeSubtitleQuality(40)).toBe('fair');
    expect(gradeSubtitleQuality(60)).toBe('good');
    expect(gradeSubtitleQuality(80)).toBe('excellent');
  });
});

describe('compareSubtitleQuality', () => {
  it('sorts higher scores first and unrated last', () => {
    const sorted = [null, 40, 90, null, 70].sort(compareSubtitleQuality);
    expect(sorted).toEqual([90, 70, 40, null, null]);
  });
});
