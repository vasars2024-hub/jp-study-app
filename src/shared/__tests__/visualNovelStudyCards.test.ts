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

  it('puts the dictionary meaning on the card, not the example sentence', () => {
    // The audit's card: back = sentence + "Scene: 岡部" + "Frequency: 1", meaning empty.
    const [vocab] = buildVisualNovelStudyCardDrafts(
      {
        vocabulary: [{ word: '実験', surface: '実験', reading: 'じっけん', occurrences: 3, sentence: '実験を始めよう。', firstSeenAt: 0 }],
        sentences: [{ text: '実験を始めよう。', start: 0, end: 1 }],
        kanji: [],
        grammar: [],
      },
      new Map([[0, 'Ch1 · Lab']]),
      new Set(),
      {},
      { glosses: new Map([['実験', 'experiment']]), speakers: new Map([[0, '紅莉栖']]) },
    );
    expect(vocab).toMatchObject({
      studyKind: 'vocabulary',
      meaning: 'experiment',
      reading: 'じっけん',
      characterName: '紅莉栖',
      sceneReference: 'Ch1 · Lab',
    });
    expect(vocab.back.split('\n\n')).toEqual(['experiment', 'じっけん', '実験を始めよう。', '紅莉栖 · Ch1 · Lab']);
    expect(vocab.back).not.toContain('Frequency');
  });

  it('cards only the kanji of mined words the learner does not know, and caps grammar', () => {
    const drafts = buildVisualNovelStudyCardDrafts(
      {
        vocabulary: [
          { word: '実験', surface: '実験', reading: 'じっけん', occurrences: 1, sentence: 'a', firstSeenAt: 0 },
          { word: '紅莉栖', surface: '紅莉栖', reading: 'くりす', occurrences: 4, sentence: 'b', firstSeenAt: 1, proper: true },
          { word: '岡部', surface: '岡部', reading: 'おかべ', occurrences: 4, sentence: 'c', firstSeenAt: 2 },
        ],
        sentences: [{ text: 'a', start: 0, end: 1 }],
        // Every kanji on screen, as the corpus reports them.
        kanji: ['実', '験', '紅', '莉', '栖', '岡', '部', '始', '今', '日'].map((character) => ({ character, occurrences: 1 })),
        grammar: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: `g${n}`, title: `～文法${n}`, level: 'N3', meaning: `pattern ${n}` })),
      },
      new Map(),
      new Set(),
      {},
      { knownKanji: new Set(['実']), characterNames: new Set(['岡部']) },
    );
    const of = (kind: string) => drafts.filter((draft) => draft.studyKind === kind).map((draft) => draft.word);
    // Character names are never vocabulary, whether the tokenizer flagged them or the capture's speaker list did.
    expect(of('vocabulary')).toEqual(['実験']);
    // Only 験: 実 is known, and the names' kanji are not mined words.
    expect(of('kanji')).toEqual(['験']);
    expect(of('grammar')).toHaveLength(3);
  });
});
