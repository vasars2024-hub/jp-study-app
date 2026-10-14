/**
 * G11: grammar content coverage, as a gate rather than a count in a report.
 *
 * At 287e8ac8 the auditor's probe (`grammarCount.mjs`, a jiti import of
 * `data/grammar/index.ts`) found N5 at 50 points against a standard N5
 * inventory of about 130, 334 Japanese and 459 of 667 Chinese points with no
 * example at all. This counts the same corpus the same way and holds it:
 *
 *   - every ja and zh point has at least one example with a translation;
 *   - N5 has at least 120 points, and at least 120 distinct ones survive the
 *     explorer's dedupe (a twin of an N4 point would not count twice);
 *   - the imported HSK list carries authored content for every record that has
 *     no twin, and each example uses the pattern it illustrates.
 */
import { describe, expect, it } from 'vitest';
import { GRAMMAR, GRAMMAR_COUNTS, GRAMMAR_MODULES, isHollowGrammarPoint } from '../data/grammar';
import { AUTHORED_CONTENT, AUTHORED_HSK_IMPORT, HSK_CONTENT_SOURCE } from '../data/grammar/authoredContent';
import { TATOEBA_EXAMPLES } from '../data/grammar/tatoebaExamples';
import { dedupeGrammarByTitle, grammarTitleKey } from '../data/grammar/practiceFilters';
import { GRAMMAR_CATEGORIES } from '../data/grammar/taxonomy';

const KANA = /[぀-ヿ]/;

describe('grammar content coverage (G11)', () => {
  it('every Japanese and Chinese point has at least one example with a translation', () => {
    const bare = GRAMMAR.filter(
      (p) =>
        (p.lang === 'ja' || p.lang === 'zh') &&
        !p.examples.some((ex) => ex.jp.trim().length > 0 && ex.en.trim().length > 0),
    ).map((p) => `${p.id} ${p.title}`);
    expect(bare).toEqual([]);
  });

  it('no Japanese or Chinese point the explorer shows is missing its content', () => {
    // Hidden twins without an explanation of their own (47 imported HSK copies)
    // stay 'missing'; the explorer shows their twin, which is not.
    const missing = dedupeGrammarByTitle(GRAMMAR)
      .filter((p) => p.lang !== 'ru' && p.provenance.verification === 'missing')
      .map((p) => p.id);
    expect(missing).toEqual([]);
  });

  it('N5 has a full inventory: at least 120 points, 120 of them distinct', () => {
    expect(GRAMMAR_COUNTS.N5).toBeGreaterThanOrEqual(120);
    const visible = dedupeGrammarByTitle(GRAMMAR).filter((p) => p.level === 'N5');
    expect(visible.length).toBeGreaterThanOrEqual(120);
  });

  it('N5 records are written, not hollow: structure, explanation, examples with readings', () => {
    const categories = new Set(GRAMMAR_CATEGORIES.map((c) => c.id));
    const ids = new Set<string>();
    for (const p of GRAMMAR_MODULES.n5) {
      expect(ids.has(p.id), p.id).toBe(false);
      ids.add(p.id);
      expect(isHollowGrammarPoint(p), p.id).toBe(false);
      expect(p.examples.length, p.id).toBeGreaterThanOrEqual(1);
      for (const ex of p.examples) {
        expect(KANA.test(ex.jp) || /[一-龯]/.test(ex.jp), `${p.id}: ${ex.jp}`).toBe(true);
        expect(ex.en.trim().length, p.id).toBeGreaterThan(3);
      }
      for (const c of p.categories ?? []) expect(categories.has(c), `${p.id}: ${c}`).toBe(true);
    }
    // The expansion keeps one record per pattern within N5 itself.
    const keys = GRAMMAR_MODULES.n5.map((p) => grammarTitleKey('ja', p.title));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('a newly added N5 point is in the corpus with its content', () => {
    const p = GRAMMAR.find((x) => x.id === 'n5-wo-kudasai');
    expect(p?.level).toBe('N5');
    expect(p?.title).toBe('〜をください');
    expect(p?.examples.every((ex) => ex.jp.includes('をください'))).toBe(true);
  });

  it('the imported HSK list carries authored content, each example using its pattern', () => {
    const imported = new Map(GRAMMAR_MODULES['hsk-import'].map((p) => [p.id, p]));
    expect(Object.keys(AUTHORED_HSK_IMPORT).length).toBeGreaterThanOrEqual(400);
    for (const [id, content] of Object.entries(AUTHORED_HSK_IMPORT)) {
      const record = imported.get(id);
      expect(record, id).toBeTruthy();
      expect(content.structure.replace(/\s/g, ''), id).not.toBe(record!.title.replace(/\s/g, ''));
      expect(content.explanation.length, id).toBeGreaterThan(60);
      expect(content.examples.length, id).toBeGreaterThanOrEqual(2);
      // The title's own characters, minus placeholders and notes, appear in order.
      const parts = record!.title
        .replace(/[（(][^）)]*[）)]/g, '')
        .split(/[…⋯.。/／~〜～\s]+|\.\.\./)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const ex of content.examples) {
        expect(KANA.test(ex.jp), `${id}: ${ex.jp}`).toBe(false);
        expect(ex.reading?.trim().length, id).toBeGreaterThan(0);
        expect(ex.en.trim().length, id).toBeGreaterThan(3);
        const alternatives = record!.title.includes('/') || record!.title.includes('／');
        const found = parts.filter((part) => ex.jp.includes(part));
        expect(alternatives ? found.length > 0 : found.length === parts.length, `${id} ${record!.title}: ${ex.jp}`).toBe(true);
      }
    }
    const filled = GRAMMAR.filter((p) => p.provenance.source === HSK_CONTENT_SOURCE);
    expect(filled.length).toBe(Object.keys(AUTHORED_HSK_IMPORT).length);
    expect(filled.every((p) => !isHollowGrammarPoint(p))).toBe(true);
  });

  it('a hidden twin borrows the examples of its twin, attribution included', () => {
    let borrowed = 0;
    for (const raw of GRAMMAR_MODULES['n4-supplement']) {
      // Records the overlays left without examples of their own.
      if (raw.examples.length || AUTHORED_CONTENT[raw.id] || TATOEBA_EXAMPLES[raw.id]) continue;
      const p = GRAMMAR.find((x) => x.id === raw.id)!;
      const key = grammarTitleKey(p.lang, p.title);
      const donor = GRAMMAR.find((x) => x.id !== p.id && grammarTitleKey(x.lang, x.title) === key && x.examples.length);
      expect(donor, p.id).toBeTruthy();
      // A full copy: sentence, reading, translation and any source/sourceId.
      expect(p.examples, p.id).toEqual(donor!.examples);
      expect(p.examples[0], p.id).not.toBe(donor!.examples[0]);
      borrowed += 1;
    }
    expect(borrowed).toBeGreaterThan(50);
  });
});
