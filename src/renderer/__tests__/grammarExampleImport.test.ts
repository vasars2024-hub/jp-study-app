// @vitest-environment jsdom
/**
 * The grammar list and example-sentence importers: the templates the dialog
 * shows parse into what they promise, in all three study languages, and
 * example rows land on the right point without duplicating.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { GRAMMAR_TEMPLATE_CSV, GRAMMAR_TEMPLATE_JSON, parseGrammarImport } from '../data/grammar/userImport';
import {
  EXAMPLE_TEMPLATE_CSV,
  EXAMPLE_TEMPLATE_JSON,
  addUserExamples,
  assignExampleRows,
  parseExampleImport,
  removeUserExample,
  userExamplesFor,
} from '../data/grammar/userExamples';
import type { GrammarPoint } from '../data/grammar/types';

beforeEach(() => localStorage.clear());

const point = (id: string, title: string, lang: 'ja' | 'zh' | 'ru' = 'ja'): GrammarPoint =>
  ({ id, title, lang, level: 'N5', meaning: '', structure: '', explanation: '', examples: [], register: 'neutral' }) as unknown as GrammarPoint;

describe('grammar list templates', () => {
  it('parse into one point per row, in each study language', () => {
    const csv = parseGrammarImport(GRAMMAR_TEMPLATE_CSV, 'grammar.csv', 'ja');
    expect(csv.skipped).toBe(0);
    expect(csv.points.map((p) => [p.lang, p.level])).toEqual([['ja', 'N5'], ['zh', 'HSK2'], ['ru', 'A2']]);
    expect(csv.points.every((p) => p.examples.length === 1 && p.examples[0].en)).toBe(true);
    const json = parseGrammarImport(GRAMMAR_TEMPLATE_JSON, 'grammar.json', 'ja');
    expect(json.points.map((p) => p.lang)).toEqual(['ja', 'ru']);
    expect(json.points[1].examples[0].jp).toBe('Мне нужно работать.');
  });
});

describe('example sentence importer', () => {
  it('reads the templates, skipping the comment line', () => {
    const csv = parseExampleImport(EXAMPLE_TEMPLATE_CSV, 'examples.csv');
    expect(csv.rows).toHaveLength(3);
    expect(csv.rows[1]).toMatchObject({ jp: '我是坐火车来的。', en: 'I came by train.' });
    expect(csv.rows[2].reading).toContain('\u0301');
    expect(parseExampleImport(EXAMPLE_TEMPLATE_JSON, 'examples.json').rows).toHaveLength(2);
    const headerless = parseExampleImport('猫がいる。\tThere is a cat.\n\t(no sentence)', 'x.tsv');
    expect(headerless.rows).toEqual([{ jp: '猫がいる。', en: 'There is a cat.' }]);
    expect(headerless.skipped).toBe(1);
  });

  it('routes rows that name another pattern to that point, same language only', () => {
    const open = point('a', '〜てもいい');
    const corpus = [open, point('b', '〜なければならない'), point('c', 'нужно', 'ru')];
    const { byPoint, unmatched } = assignExampleRows(
      [
        { jp: 'ここに座ってもいい。', en: 'x' },
        { jp: '行かなければならない。', en: 'y', pattern: 'なければならない' },
        { jp: 'Нужно идти.', en: 'z', pattern: 'нужно' },
      ],
      open,
      corpus,
    );
    expect(byPoint.get('a')).toHaveLength(1);
    expect(byPoint.get('b')).toHaveLength(1);
    expect(byPoint.has('c')).toBe(false);
    expect(unmatched).toBe(1);
  });

  it('adds without duplicating shipped or earlier sentences, and removes', () => {
    const shipped = [{ jp: '既にある。', en: 'Already there.' }];
    expect(addUserExamples('p1', [{ jp: '既にある。', en: '' }, { jp: '新しい。', en: 'New.' }], shipped, 5)).toBe(1);
    expect(addUserExamples('p1', [{ jp: '新しい。', en: 'New.' }], shipped)).toBe(0);
    expect(addUserExamples('p1', [{ jp: 'Tatoeba文。', en: 'T.', fromTatoeba: true }])).toBe(1);
    const list = userExamplesFor('p1');
    expect(list.map((e) => e.jp)).toEqual(['新しい。', 'Tatoeba文。']);
    expect(list[1].source).toBe('tatoeba');
    removeUserExample('p1', '新しい。');
    expect(userExamplesFor('p1').map((e) => e.jp)).toEqual(['Tatoeba文。']);
  });
});
