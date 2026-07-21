import { describe, expect, it } from 'vitest';
import {
  estimateBookLevel,
  type BookLevelBand,
} from '../bookLevelEstimate';

function band(id: BookLevelBand['id'], short: string, words: string[]): BookLevelBand {
  return { id, short, words: new Set(words) };
}

describe('estimateBookLevel', () => {
  const n5 = band('jlpt-n5', 'N5', ['猫', '犬', '水']);
  const n4 = band('jlpt-n4', 'N4', ['旅行', '病院']);
  const n3 = band('jlpt-n3', 'N3', ['経済', '政治']);

  it('returns null for empty lemmas or empty bands', () => {
    expect(estimateBookLevel([], [n5], 'ja')).toBeNull();
    expect(estimateBookLevel(['猫'], [], 'ja')).toBeNull();
  });

  it('picks the lowest band whose cumulative coverage clears the threshold', () => {
    // All N5 words → covered at N5.
    const easy = estimateBookLevel(['猫', '犬', '水', '猫'], [n5, n4, n3], 'ja', {
      threshold: 0.85,
    });
    expect(easy?.label).toBe('N5');
    expect(easy?.level).toBe(5);
    expect(easy?.metThreshold).toBe(true);
    expect(easy?.confidence).toBe(1);

    // Mix of N5 + N4 — N5 alone is 3/5 = 0.6; N5∪N4 is 5/5 = 1 → N4.
    const mid = estimateBookLevel(['猫', '犬', '水', '旅行', '病院'], [n5, n4, n3], 'ja', {
      threshold: 0.85,
    });
    expect(mid?.label).toBe('N4');
    expect(mid?.level).toBe(4);
  });

  it('falls back to hardest band when nothing clears the threshold', () => {
    // One N3 word + unknowns; even N5∪N4∪N3 only covers 1/3.
    const hard = estimateBookLevel(['経済', '未知A', '未知B'], [n5, n4, n3], 'ja', {
      threshold: 0.85,
    });
    expect(hard?.label).toBe('N3');
    expect(hard?.metThreshold).toBe(false);
    expect(hard?.confidence).toBeCloseTo(1 / 3, 5);
  });

  it('estimates HSK bands for zh', () => {
    const h1 = band('hsk-1', 'HSK1', ['我', '你']);
    const h2 = band('hsk-2', 'HSK2', ['朋友']);
    // HSK1 alone covers 2/4 = 0.5; HSK1∪HSK2 covers 4/4 → HSK2.
    const est = estimateBookLevel(['我', '你', '朋友', '朋友'], [h1, h2], 'zh', {
      threshold: 0.85,
    });
    expect(est?.scheme).toBe('hsk');
    expect(est?.label).toBe('HSK2');
    expect(est?.level).toBe(2);
  });
});
