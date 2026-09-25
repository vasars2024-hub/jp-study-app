// @vitest-environment jsdom
//
// A learner's own grammar list — CSV, TSV or JSON, in any study language —
// becomes corpus records awaiting review, and stays after a restart.
import { beforeEach, describe, expect, it } from 'vitest';
import { normalizeGrammarLevel, parseGrammarImport } from '../data/grammar/userImport';
import { GRAMMAR, USER_GRAMMAR_KEY, importUserGrammar } from '../data/grammar';

beforeEach(() => {
  localStorage.clear();
});

describe('parseGrammarImport', () => {
  it('reads a CSV with a header, quoted cells and example/translation pairs (Russian)', () => {
    const csv = [
      'pattern,meaning,level,example,translation',
      '"если бы ..., ... бы",unreal condition,B1,"Если бы я знал, я бы сказал.",If I had known I would have said.',
      ',no pattern,A1,,',
    ].join('\n');
    const { points, skipped } = parseGrammarImport(csv, 'ru-grammar.csv', 'ja');
    expect(skipped).toBe(1);
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({
      lang: 'ru', level: 'B1', title: 'если бы ..., ... бы', meaning: 'unreal condition',
      examples: [{ jp: 'Если бы я знал, я бы сказал.', en: 'If I had known I would have said.' }],
    });
  });

  it('reads a headerless TSV (Chinese) and files an unknown level at the first band, flagged', () => {
    const { points } = parseGrammarImport('把\tdisposal construction\t我把书放在桌子上。\tI put the book on the table.\t', 'zh.tsv', 'zh');
    expect(points[0]).toMatchObject({ lang: 'zh', level: 'HSK1', provenance: { mappingConfidence: 0 } });
    expect(points[0].examples[0].en).toBe('I put the book on the table.');
  });

  it('reads JSON in the corpus shape (Japanese)', () => {
    const json = JSON.stringify([{ title: '〜てしまう', meaning: 'to end up doing', level: 'N4', examples: [{ jp: '食べてしまった。', en: 'I ate it all.' }] }]);
    expect(parseGrammarImport(json, 'ja.json', 'ru').points[0]).toMatchObject({ lang: 'ja', level: 'N4' });
  });

  it('understands the level scales', () => {
    expect(normalizeGrammarLevel('hsk 3')).toBe('HSK3');
    expect(normalizeGrammarLevel('HSK8')).toBe('HSK7-9');
    expect(normalizeGrammarLevel('n2')).toBe('N2');
    expect(normalizeGrammarLevel('b2')).toBe('B2');
    expect(normalizeGrammarLevel('advanced')).toBeNull();
  });
});

describe('importUserGrammar', () => {
  it('adds the points to the corpus as imported, unreviewed content, persists them, and does not duplicate', () => {
    const { points } = parseGrammarImport('pattern,meaning,level\nчем … тем,the more … the more,B1', 'ru.csv', 'ru');
    expect(importUserGrammar(points)).toBe(1);
    expect(importUserGrammar(points)).toBe(0);
    const inCorpus = GRAMMAR.filter((p) => p.id === points[0].id);
    expect(inCorpus).toHaveLength(1);
    expect(inCorpus[0].provenance).toMatchObject({ verification: 'missing' });
    expect(JSON.parse(localStorage.getItem(USER_GRAMMAR_KEY) ?? '[]')).toHaveLength(1);
  });
});
