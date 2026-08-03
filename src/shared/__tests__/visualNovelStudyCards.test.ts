import { describe, expect, it } from 'vitest';
import {
  buildVisualNovelStudyCardDrafts,
  visualNovelStudyCardKey,
} from '../visualNovelStudyCards';

describe('visual novel study card drafts', () => {
  const analysis = {
    vocabulary: [{
      word: '研究',
      surface: '研究',
      reading: 'ケンキュウ',
      occurrences: 3,
      sentence: '研究を続けます。',
      firstSeenAt: 0,
    }],
    sentences: [{ start: 0, end: 1, text: '研究を続けます。' }],
    kanji: [{ character: '研', occurrences: 3 }],
    grammar: [{ id: 'g1', title: '～ます', level: 'N5', meaning: 'Polite verb ending' }],
  };

  it('builds all four card kinds with frequency and scene context', () => {
    const drafts = buildVisualNovelStudyCardDrafts(
      analysis,
      new Map([[0, 'Chapter 1 · Laboratory']]),
    );
    expect(drafts.map((draft) => draft.studyKind)).toEqual([
      'vocabulary',
      'sentence',
      'kanji',
      'grammar',
    ]);
    expect(drafts[0]).toMatchObject({
      word: '研究',
      frequency: 3,
      sceneReference: 'Chapter 1 · Laboratory',
    });
    expect(drafts[2].reading).toBe('ケンキュウ');
    expect(drafts[3].jlptLevel).toBe('N5');
  });

  it('deduplicates existing typed cards without conflating card kinds', () => {
    const drafts = buildVisualNovelStudyCardDrafts(
      analysis,
      new Map(),
      new Set([visualNovelStudyCardKey('vocabulary', '研究', '研究を続けます。')]),
    );
    expect(drafts.some((draft) => draft.studyKind === 'vocabulary')).toBe(false);
    expect(drafts.some((draft) => draft.studyKind === 'sentence')).toBe(true);
  });
});
