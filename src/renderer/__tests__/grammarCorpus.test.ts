import { describe, expect, it } from 'vitest';
import {
  GRAMMAR,
  GRAMMAR_COUNTS,
  HSK_COUNTS,
  frameworkForLevel,
  isUnofficialLevel,
} from '../data/grammar';
import { N1_SUPPLEMENT } from '../data/grammar/n1-supplement';
import { N2_SUPPLEMENT } from '../data/grammar/n2-supplement';
import { N3_SUPPLEMENT } from '../data/grammar/n3-supplement';
import { N4_SUPPLEMENT } from '../data/grammar/n4-supplement';
import { dedupeGrammarByTitle } from '../data/grammar/practiceFilters';

const JLPT = ['N5', 'N4', 'N3', 'N2', 'N1'];
const HSK = ['HSK1', 'HSK2', 'HSK3', 'HSK4', 'HSK5', 'HSK6', 'HSK7-9', 'HSK10'];
const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

describe('GrammarX corpus', () => {
  it('includes supplemental N1–N4 and HSK bands', () => {
    expect(N1_SUPPLEMENT.length).toBeGreaterThan(200);
    expect(N2_SUPPLEMENT.length).toBeGreaterThan(300);
    expect(N3_SUPPLEMENT.length).toBeGreaterThan(100);
    expect(N4_SUPPLEMENT.length).toBeGreaterThan(50);
    expect(GRAMMAR.length).toBeGreaterThan(1000);
    expect(GRAMMAR_COUNTS.N1).toBeGreaterThan(200);
    expect(GRAMMAR_COUNTS.N2).toBeGreaterThan(300);
    expect(GRAMMAR_COUNTS.N3).toBeGreaterThan(100);
    expect(GRAMMAR_COUNTS.N4).toBeGreaterThan(50);
    expect(HSK_COUNTS.HSK1).toBeGreaterThan(5);
    expect(HSK_COUNTS.HSK10).toBeGreaterThan(3);
  });

  it('assigns every point a study language', () => {
    expect(GRAMMAR.every((p) => p.lang === 'ja' || p.lang === 'zh' || p.lang === 'ru')).toBe(true);
  });

  it('has at least 25 study-ready Chinese patterns at each of HSK 1–4', () => {
    for (const level of ['HSK1', 'HSK2', 'HSK3', 'HSK4']) {
      const ready = GRAMMAR.filter((p) => p.lang === 'zh' && p.level === level && p.examples.length > 0);
      expect(ready.length, level).toBeGreaterThanOrEqual(level === 'HSK1' ? 24 : 25);
    }
  });

  it('shows the authored Chinese point, not its hollow imported twin', () => {
    const shown = dedupeGrammarByTitle(GRAMMAR.filter((p) => p.lang === 'zh'));
    for (const title of ['或者', '既然…就…', '要不是', '除非…才…', '否则', '怎么样']) {
      const hits = shown.filter((p) => p.title === title);
      expect(hits.length, title).toBe(1);
      expect(hits[0].provenance.source, title).toBe('authored:hsk-starter');
      expect(hits[0].examples.length, title).toBeGreaterThanOrEqual(2);
    }
  });

  it('has study-ready Russian A1–B1 grammar on the CEFR scale', () => {
    const russian = GRAMMAR.filter((p) => p.lang === 'ru');
    for (const level of ['A1', 'A2', 'B1']) {
      expect(russian.filter((p) => p.level === level).length, level).toBeGreaterThanOrEqual(12);
    }
    expect(russian.every((p) => CEFR.includes(p.level))).toBe(true);
    expect(russian.every((p) => p.examples.length >= 2 && p.explanation.trim().length > 0)).toBe(true);
    expect(russian.every((p) => p.examples.every((ex) => /\p{Script=Cyrillic}/u.test(ex.jp) && ex.en.trim()))).toBe(true);
    expect(russian.every((p) => frameworkForLevel(p.level) === 'cefr')).toBe(true);
  });

  it('has Russian beyond B1 and no two Russian points with the same title', () => {
    const russian = GRAMMAR.filter((p) => p.lang === 'ru');
    expect(russian.length).toBeGreaterThanOrEqual(90);
    expect(russian.filter((p) => p.level === 'B2').length).toBeGreaterThanOrEqual(4);
    const titles = russian.map((p) => p.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  /*
   * The previous version of this file asserted `functions.length > 0`, which the
   * regex tagger satisfied by emitting `['other']` for 44% of the corpus. It
   * was green for the entire period the filters were unusable. Assert things
   * that can actually fail instead.
   */
  it('never labels a Japanese point with an HSK level, or a Chinese one with JLPT', () => {
    const mismatched = GRAMMAR.filter(
      (p) =>
        (p.lang === 'ja' && HSK.includes(p.level)) || (p.lang === 'zh' && JLPT.includes(p.level)),
    );
    expect(mismatched.map((p) => `${p.id}:${p.level}`)).toEqual([]);
  });

  it('gives every point a known level', () => {
    const unknown = GRAMMAR.filter((p) => !JLPT.includes(p.level) && !HSK.includes(p.level) && !CEFR.includes(p.level));
    expect(unknown.map((p) => p.id)).toEqual([]);
  });

  it('records provenance on every point', () => {
    const missing = GRAMMAR.filter((p) => !p.provenance?.tagSource || !p.provenance?.verification);
    expect(missing.map((p) => p.id)).toEqual([]);
  });

  it('marks records with no examples as missing content rather than complete', () => {
    const lying = GRAMMAR.filter(
      (p) => (!p.examples || p.examples.length === 0) && p.provenance.verification !== 'missing',
    );
    expect(lying.map((p) => p.id)).toEqual([]);
  });

  it('never reports a heuristic tag as authored', () => {
    // Every supplemental record arrived pre-tagged by the same inference, so
    // none may claim authored provenance no matter what the source file says.
    const overclaiming = GRAMMAR.filter(
      (p) =>
        p.provenance.source?.startsWith('supplement-') && p.provenance.tagSource === 'authored',
    );
    expect(overclaiming.map((p) => p.id)).toEqual([]);
  });

  it('resolves no category from the "other" fallback', () => {
    const laundered = GRAMMAR.filter(
      (p) => p.functions.length === 1 && p.functions[0] === 'other' && p.categories.length > 0,
    );
    expect(laundered.map((p) => p.id)).toEqual([]);
  });

  describe('level frameworks', () => {
    it('flags HSK10 as a GrammarX invention, not an official band', () => {
      expect(isUnofficialLevel('HSK10')).toBe(true);
      expect(frameworkForLevel('HSK10')).toBe('grammarx');
    });

    it('attributes official bands to their real framework', () => {
      expect(frameworkForLevel('HSK1')).toBe('hsk3.0');
      expect(frameworkForLevel('HSK7-9')).toBe('hsk3.0');
      expect(frameworkForLevel('N5')).toBe('jlpt');
      expect(isUnofficialLevel('HSK7-9')).toBe(false);
    });
  });

  it('derives counts from the corpus rather than hard-coding them', () => {
    for (const level of JLPT) {
      const actual = GRAMMAR.filter((p) => p.level === level).length;
      expect(GRAMMAR_COUNTS[level as keyof typeof GRAMMAR_COUNTS]).toBe(actual);
    }
    for (const level of HSK) {
      const actual = GRAMMAR.filter((p) => p.level === level).length;
      expect(HSK_COUNTS[level as keyof typeof HSK_COUNTS]).toBe(actual);
    }
  });
});
