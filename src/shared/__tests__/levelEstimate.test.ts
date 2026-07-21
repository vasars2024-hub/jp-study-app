import { describe, expect, it } from 'vitest';
import {
  badgeForTier,
  estimateTextLevel,
  estimateUserLevel,
  levelLabel,
} from '../levelEstimate';

describe('badgeForTier / levelLabel', () => {
  it('uses slot short labels for graded tiers', () => {
    expect(badgeForTier('ja', 4)).toBe('N3');
    expect(badgeForTier('zh', 4)).toBe('HSK 4');
    expect(levelLabel('ja', 4)).toBe('JLPT N3');
    expect(levelLabel('zh', 4)).toBe('HSK 4');
  });

  it('falls back to Beginner / Advanced', () => {
    expect(badgeForTier('ja', 1)).toBe('Beginner');
    expect(badgeForTier('ja', 7)).toBe('Advanced');
    expect(badgeForTier('zh', 7)).toBe('Advanced');
  });
});

describe('estimateUserLevel', () => {
  it('maps cleared N3 coverage to an N3 badge', () => {
    const e = estimateUserLevel('ja', { coverageBySlot: { 'jlpt-n3': 0.85 } });
    expect(e.tier).toBe(4);
    expect(e.short).toBe('N3');
    expect(e.scheme).toBe('jlpt');
  });

  it('maps cleared HSK 4 coverage to an HSK 4 badge', () => {
    const e = estimateUserLevel('zh', { coverageBySlot: { 'hsk-4': 0.9 } });
    expect(e.tier).toBe(4);
    expect(e.short).toBe('HSK 4');
    expect(e.scheme).toBe('hsk');
  });
});

describe('estimateTextLevel', () => {
  const n5 = ['私', '食べる', '学校'];
  const n4 = ['会議', '経験'];
  const n3 = ['抽象', '概念'];

  it('returns N4 when N5 alone is under the threshold but N4 cumulative clears it', () => {
    const e = estimateTextLevel('ja', {
      lemmas: ['私', '食べる', '学校', '会議'],
      wordsBySlot: {
        'jlpt-n5': n5,
        'jlpt-n4': n4,
        'jlpt-n3': n3,
      },
    });
    // unique: 私,食べる,学校,会議 → 3/4 = 0.75 at N5, 4/4 at N4
    expect(e.short).toBe('N4');
  });

  it('returns N5 when ≥80% of lemmas are N5', () => {
    const e = estimateTextLevel('ja', {
      lemmas: ['私', '食べる', '学校', '水', '本'],
      wordsBySlot: {
        'jlpt-n5': ['私', '食べる', '学校', '水', '本'],
        'jlpt-n4': n4,
      },
      threshold: 0.8,
    });
    expect(e.tier).toBe(2);
    expect(e.short).toBe('N5');
  });

  it('returns Advanced when too many lemmas are outside every band', () => {
    const e = estimateTextLevel('ja', {
      lemmas: ['私', '玄妙', '幽玄', '深遠', '秘匿'],
      wordsBySlot: { 'jlpt-n5': ['私'] },
      threshold: 0.8,
    });
    expect(e.tier).toBe(7);
    expect(e.short).toBe('Advanced');
  });

  it('estimates HSK from Chinese bands', () => {
    const e = estimateTextLevel('zh', {
      lemmas: ['我', '你', '他', '她', '会议'],
      wordsBySlot: {
        'hsk-1': ['我', '你', '他', '她'],
        'hsk-3': ['会议'],
      },
      threshold: 0.8,
    });
    // 4/5 = 0.8 at HSK1
    expect(e.short).toBe('HSK 1');
  });

  it('defaults empty text to Beginner / HSK 1 tier', () => {
    expect(estimateTextLevel('ja', { lemmas: [], wordsBySlot: {} }).tier).toBe(1);
    expect(estimateTextLevel('zh', { lemmas: [], wordsBySlot: {} }).short).toBe('HSK 1');
  });
});
