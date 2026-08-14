import { describe, expect, it } from 'vitest';
import {
  MAX_NEIGHBOR_PROBE_SENSES,
  rankLexiconNeighbors,
  selectNeighborProbeSenses,
  type LexiconNeighborCandidate,
} from '../lexiconNeighbors';

const candidate = (over: Partial<LexiconNeighborCandidate> = {}): LexiconNeighborCandidate => ({
  lang: 'ja',
  text: '食事',
  reading: 'しょくじ',
  dictId: 'jmdict-en',
  dictTitle: 'JMdict (English)',
  sense: 'meal',
  priority: 0,
  ...over,
});

describe('selectNeighborProbeSenses', () => {
  it('drops one-character and definition-length glosses', () => {
    expect(selectNeighborProbeSenses(['a', 'to eat', 'x'.repeat(200)])).toEqual(['to eat']);
  });

  it('deduplicates case-insensitively but keeps the first casing seen', () => {
    expect(selectNeighborProbeSenses(['Cat', 'cat', 'CAT', 'kitten'])).toEqual(['Cat', 'kitten']);
  });

  it('caps the number of probes so one entry cannot fan out unboundedly', () => {
    const many = Array.from({ length: 40 }, (_, i) => `sense ${i}`);
    expect(selectNeighborProbeSenses(many)).toHaveLength(MAX_NEIGHBOR_PROBE_SENSES);
  });
});

describe('rankLexiconNeighbors', () => {
  it('never returns the queried word itself, by either writing or reading', () => {
    // Queried by reading, so both exclusion arms are exercised: the kana row is
    // the query written out, and the kanji row is the query's own headword.
    const ranked = rankLexiconNeighbors('ねこ', [
      candidate({ text: '猫', reading: 'ねこ', sense: 'cat' }),
      candidate({ text: 'ねこ', reading: 'ねこ', sense: 'cat' }),
      candidate({ text: '子猫', reading: 'こねこ', sense: 'cat' }),
    ]);
    expect(ranked.map((item) => item.text)).toEqual(['子猫']);
  });

  it('folds kana, so the query in the other syllabary is not its own neighbour', () => {
    // This layer only knows the query string, so it is the kana query that it
    // has to protect; a kanji query's katakana spelling is excluded upstream by
    // the entry's own reading. Both halves are needed and neither covers the other.
    const ranked = rankLexiconNeighbors('ねこ', [
      candidate({ text: 'ネコ', reading: 'ネコ', sense: 'cat' }),
      candidate({ text: '子猫', reading: 'こねこ', sense: 'cat' }),
    ]);
    expect(ranked.map((item) => item.text)).toEqual(['子猫']);
  });

  it('collapses one word supplied by two dictionaries into a single row', () => {
    const ranked = rankLexiconNeighbors('猫', [
      candidate({ text: '子猫', reading: 'こねこ', sense: 'kitten', dictId: 'a', priority: 3 }),
      candidate({ text: '子猫', reading: 'こねこ', sense: 'kitten', dictId: 'b', priority: 1 }),
    ]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].sharedSenses).toEqual(['kitten']);
  });

  it('ranks more shared senses first, then dictionary priority, then arrival order', () => {
    const ranked = rankLexiconNeighbors('走る', [
      candidate({ text: '駆ける', reading: 'かける', sense: 'to run', priority: 5 }),
      candidate({ text: '疾走', reading: 'しっそう', sense: 'to run', priority: 0 }),
      candidate({ text: '駆ける', reading: 'かける', sense: 'to dash', priority: 5 }),
      candidate({ text: '走行', reading: 'そうこう', sense: 'to run', priority: 9 }),
    ]);
    expect(ranked.map((item) => item.text)).toEqual(['駆ける', '疾走', '走行']);
    expect(ranked[0].sharedSenses).toEqual(['to run', 'to dash']);
  });

  it('honours the result limit', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      candidate({ text: `語${i}`, reading: `よみ${i}` }));
    expect(rankLexiconNeighbors('猫', many, 4)).toHaveLength(4);
  });
});
