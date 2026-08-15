import { describe, expect, it } from 'vitest';
import {
  FREQUENCY_BAND_LIMITS,
  MAX_FREQUENCY_RESULTS,
  buildLexiconFrequencyResult,
  frequencyBand,
  selectLexiconFrequencies,
  type LexiconFrequencyEntry,
} from '../lexiconFrequency';

function entry(overrides: Partial<LexiconFrequencyEntry> = {}): LexiconFrequencyEntry {
  return { corpusId: 'c1', corpusTitle: 'Corpus one', rank: 100, ...overrides };
}

describe('frequency bands', () => {
  it('puts each rank in the band its own limit names, at the boundary too', () => {
    expect(frequencyBand(1)).toBe('veryCommon');
    expect(frequencyBand(1_500)).toBe('veryCommon');
    expect(frequencyBand(1_501)).toBe('common');
    expect(frequencyBand(5_000)).toBe('common');
    expect(frequencyBand(5_001)).toBe('uncommon');
    expect(frequencyBand(15_000)).toBe('uncommon');
    expect(frequencyBand(15_001)).toBe('rare');
  });

  it('has no band for something that is not a rank, rather than calling it common', () => {
    expect(frequencyBand(0)).toBeUndefined();
    expect(frequencyBand(-3)).toBeUndefined();
    expect(frequencyBand(Number.NaN)).toBeUndefined();
    expect(frequencyBand(Number.POSITIVE_INFINITY)).toBeUndefined();
  });

  it('keeps its limits strictly increasing, or a rank would fall in two bands', () => {
    const limits = FREQUENCY_BAND_LIMITS.map(([, limit]) => limit);
    expect(limits).toEqual([...limits].sort((a, b) => a - b));
    expect(new Set(limits).size).toBe(limits.length);
  });
});

describe('choosing which corpora speak', () => {
  it('orders by rank, not by the priority the rows arrived in', () => {
    const chosen = selectLexiconFrequencies([
      entry({ corpusId: 'high-priority', rank: 9_000 }),
      entry({ corpusId: 'low-priority', rank: 12 }),
    ]);
    expect(chosen.map((row) => row.corpusId)).toEqual(['low-priority', 'high-priority']);
  });

  it('gives one corpus one row, keeping the best rank it published', () => {
    const chosen = selectLexiconFrequencies([
      entry({ corpusId: 'c1', rank: 900 }),
      entry({ corpusId: 'c1', rank: 40 }),
      entry({ corpusId: 'c2', rank: 500 }),
    ]);
    expect(chosen).toHaveLength(2);
    expect(chosen[0]).toMatchObject({ corpusId: 'c1', rank: 40 });
  });

  it('breaks a tie by the incoming order, so the same rows always sort the same way', () => {
    const chosen = selectLexiconFrequencies([
      entry({ corpusId: 'first', rank: 7 }),
      entry({ corpusId: 'second', rank: 7 }),
    ]);
    expect(chosen.map((row) => row.corpusId)).toEqual(['first', 'second']);
  });

  it('drops a row whose rank is not a rank instead of sorting it to the front', () => {
    const chosen = selectLexiconFrequencies([
      entry({ corpusId: 'broken', rank: 0 }),
      entry({ corpusId: 'real', rank: 300 }),
    ]);
    expect(chosen.map((row) => row.corpusId)).toEqual(['real']);
  });

  it('stops at the cap rather than turning the panel into a table', () => {
    const rows = Array.from({ length: MAX_FREQUENCY_RESULTS + 4 }, (_, i) =>
      entry({ corpusId: `c${i}`, rank: i + 1 }));
    expect(selectLexiconFrequencies(rows)).toHaveLength(MAX_FREQUENCY_RESULTS);
  });
});

describe('the whole result', () => {
  it('bands on the best rank, which is the row it also shows first', () => {
    const result = buildLexiconFrequencyResult('猫', [
      entry({ corpusId: 'a', rank: 40_000 }),
      entry({ corpusId: 'b', rank: 900 }),
    ]);
    expect(result.entries[0].corpusId).toBe('b');
    expect(result.band).toBe('veryCommon');
  });

  it('has no band at all when no corpus knows the word, so nothing claims it is rare', () => {
    const result = buildLexiconFrequencyResult('胼胝', []);
    expect(result).toEqual({ query: '胼胝', entries: [] });
    expect(result.band).toBeUndefined();
  });

  it('carries per-million only when the corpus published one', () => {
    const result = buildLexiconFrequencyResult('猫', [
      entry({ corpusId: 'a', rank: 5, perMillion: 12.5 }),
      entry({ corpusId: 'b', rank: 6 }),
    ]);
    expect(result.entries[0].perMillion).toBe(12.5);
    expect(result.entries[1]).not.toHaveProperty('perMillion');
  });
});
