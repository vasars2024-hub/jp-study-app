import { describe, expect, it } from 'vitest';
import {
  buildMediaStudyCorpus,
  buildMediaStudyFlashcardDrafts,
  type MediaStudyTokenInput,
} from '../mediaStudyExtraction';

const token = (
  surface: string,
  extra: Partial<MediaStudyTokenInput> = {},
): MediaStudyTokenInput => ({
  surface,
  lemma: surface,
  content: true,
  ...extra,
});

describe('media study extraction', () => {
  it('extracts and ranks vocabulary and kanji from Japanese subtitle cues', () => {
    const corpus = buildMediaStudyCorpus([
      { start: 1, end: 2, text: '猫が魚を食べる' },
      { start: 3, end: 4, text: '猫は寝る' },
      { start: 5, end: 6, text: 'English only' },
    ], (text) => {
      if (text.includes('魚')) {
        return [
          token('猫', { reading: 'ネコ' }),
          token('魚', { reading: 'サカナ' }),
          token('食べる', { reading: 'タベル' }),
          token('が', { content: false }),
        ];
      }
      return [
        token('猫', { reading: 'ネコ' }),
        token('寝る', { reading: 'ネル' }),
        token('私', { proper: true }),
      ];
    });

    expect(corpus.sentences).toHaveLength(2);
    expect(corpus.vocabulary.map((entry) => [entry.word, entry.occurrences])).toEqual([
      ['猫', 2],
      ['魚', 1],
      ['食べる', 1],
      ['寝る', 1],
    ]);
    expect(corpus.kanji.slice(0, 4)).toEqual([
      { character: '猫', occurrences: 2 },
      { character: '魚', occurrences: 1 },
      { character: '食', occurrences: 1 },
      { character: '寝', occurrences: 1 },
    ]);
  });

  it('bounds large subtitle input and records truncation', () => {
    const corpus = buildMediaStudyCorpus([
      { start: 0, end: 1, text: '最初の文' },
      { start: 1, end: 2, text: '次の文' },
    ], () => [], { maxCues: 1 });

    expect(corpus.sentences.map((sentence) => sentence.text)).toEqual(['最初の文']);
    expect(corpus.truncated).toBe(true);
  });

  it('creates bounded flashcard drafts while excluding existing words', () => {
    const drafts = buildMediaStudyFlashcardDrafts([
      { word: '猫', surface: '猫', reading: 'ネコ', occurrences: 3, sentence: '猫がいる。', firstSeenAt: 1 },
      { word: '魚', surface: '魚', reading: 'サカナ', occurrences: 2, sentence: '魚を食べる。', firstSeenAt: 2 },
      { word: '食べる', surface: '食べる', reading: 'タベル', occurrences: 1, sentence: '魚を食べる。', firstSeenAt: 2 },
    ], { limit: 1, excludeWords: new Set(['猫']) });

    expect(drafts).toEqual([{
      word: '魚',
      reading: 'サカナ',
      sentence: '魚を食べる。',
      front: '魚',
      back: 'サカナ\n\n魚を食べる。',
    }]);
  });
});

describe('buildMediaStudyCorpus — Chinese and Russian subtitles', () => {
  const words = (text: string) => text.split(/[\s。，.,!?]+/u).filter(Boolean).map((w) => ({ surface: w, lemma: w.toLowerCase(), content: true }));

  it('keeps Russian lines and words (a Japanese-only filter used to drop them all)', () => {
    const corpus = buildMediaStudyCorpus(
      [{ start: 0, end: 1, text: 'Я вижу кошку.' }, { start: 1, end: 2, text: 'Ok!' }],
      words,
      { lang: 'ru' },
    );
    expect(corpus.sentences.map((s) => s.text)).toEqual(['Я вижу кошку.']);
    expect(corpus.vocabulary.map((v) => v.word)).toContain('кошку');
    expect(corpus.kanji).toEqual([]);
  });

  it('keeps Chinese lines and counts their hanzi', () => {
    const corpus = buildMediaStudyCorpus(
      [{ start: 0, end: 1, text: '今天 天气 很好' }],
      words,
      { lang: 'zh' },
    );
    expect(corpus.vocabulary.map((v) => v.word).sort()).toEqual(['今天', '天气', '很好'].sort());
    expect(corpus.kanji.find((k) => k.character === '天')?.occurrences).toBe(2);
  });
});
