/**
 * dict3 — every link and every key the dictionary's Yomitan-parity surfaces can
 * produce must resolve: each grammar point the conjugation trace links to is a
 * point the explorer can focus (it survives the explorer's own de-duplication),
 * and each catalog key the trace and the priority tooltip compute exists in
 * every language.
 */
import { describe, expect, it } from 'vitest';
import { GRAMMAR } from '../data/grammar';
import { dedupeGrammarByTitle } from '../data/grammar/practiceFilters';
import { DEINFLECT_GRAMMAR_IDS, DEINFLECT_KNOWN_REASONS, deinflectStepInfo } from '../../shared/deinflectTrace';
import { JMDICT_PRIORITY_KEYS } from '../../shared/jmdictPriority';
import { CATALOGS as ALL_CATALOGS } from '../../shared/i18n/catalogs/all';

describe('dict3 conjugation trace links', () => {
  it('links only to grammar points the explorer can open', () => {
    const ids = new Set(dedupeGrammarByTitle(GRAMMAR).map((point) => point.id));
    const missing = DEINFLECT_GRAMMAR_IDS.filter((id) => !ids.has(id));
    expect(missing).toEqual([]);
  });
});

describe('dict3 catalog keys', () => {
  const keys = [
    ...DEINFLECT_KNOWN_REASONS.map((reason) => deinflectStepInfo(reason).labelKey).filter((key): key is string => Boolean(key)),
    ...JMDICT_PRIORITY_KEYS,
  ];
  for (const lang of ['en', 'ja', 'zh', 'ru'] as const) {
    it(`has every computed key in ${lang}`, () => {
      const catalog = ALL_CATALOGS[lang] as Record<string, unknown>;
      expect(keys.filter((key) => !(key in catalog))).toEqual([]);
    });
  }

  it('gives Russian every CLDR plural form for the counted strings', () => {
    const ru = ALL_CATALOGS.ru as Record<string, unknown>;
    for (const key of ['dict3.sections.showMore', 'dict3.settings.audioFiles']) {
      expect(Object.keys(ru[key] as object).sort()).toEqual(['few', 'many', 'one', 'other']);
    }
  });
});
