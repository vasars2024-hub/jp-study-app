// @vitest-environment node
/*
 * The bundled JMdict (yomidevs/jmdict-yomitan) gives each word an extra row
 * tagged `forms` whose glossary is a spelling × reading table. Gum flattened it
 * into a gloss, so the extension popup showed `図書館としょかん★ずしょかん⛬` as a
 * meaning (2026-10 hardware run). It is dropped at the lookup boundary.
 */
import { describe, expect, it } from 'vitest';
import { isFormsSense, looksLikeFlattenedFormsTable, withoutFormsSenses } from '../../shared/dictFormsSense';
import { lookupResultToDictResult, lookupResultToPerLanguageDictResult } from '../dictionary/lexiconAdapter';
import type { LookupEntry, LookupResult } from '../dictionary/dictService';

const FORMS_TEXT = '図書館としょかん★ずしょかん⛬';

function entry(overrides: Partial<LookupEntry> = {}): LookupEntry {
  return {
    headwordId: 1,
    dictId: 'bundled-jmdict-en',
    dictTitle: 'JMdict (Japanese–English)',
    lang: 'ja',
    text: '図書館',
    reading: 'としょかん',
    readingNorm: 'としょかん',
    via: 'exact',
    score: 1999800,
    senses: [
      { pos: ['n'], tags: [], glosses: [{ lang: 'en', text: 'library' }] },
      { pos: [], tags: ['other surface forms and readings'], glosses: [{ lang: 'en', text: FORMS_TEXT }] },
    ],
    ...overrides,
  } as LookupEntry;
}

function result(entries: LookupEntry[]): LookupResult {
  return { query: '図書館', detectedLangs: ['ja'], entries } as LookupResult;
}

describe('recognising the forms table', () => {
  it('by its tag, raw or resolved', () => {
    expect(isFormsSense({ tags: ['forms'], definitions: ['x'] })).toBe(true);
    expect(isFormsSense({ tags: ['Other surface forms and readings'], definitions: ['x'] })).toBe(true);
  });

  it('by its shape when the tag was lost, but never a real gloss', () => {
    expect(looksLikeFlattenedFormsTable(FORMS_TEXT)).toBe(true);
    expect(isFormsSense({ partsOfSpeech: [], tags: [], definitions: [FORMS_TEXT] })).toBe(true);
    expect(isFormsSense({ partsOfSpeech: ['n'], tags: [], definitions: ['library'] })).toBe(false);
    // A Japanese-Japanese definition has no table marks.
    expect(looksLikeFlattenedFormsTable('図書・記録などを集めて保管し、利用させる施設。')).toBe(false);
    expect(looksLikeFlattenedFormsTable('library ★')).toBe(false);
    expect(isFormsSense({ partsOfSpeech: [], tags: [], definitions: ['library', FORMS_TEXT] })).toBe(false);
  });

  it('drops a sense, or the whole row when that was all it held', () => {
    const word = { senses: [{ partsOfSpeech: ['n'], definitions: ['library'] }, { tags: ['forms'], definitions: [FORMS_TEXT] }] };
    expect(withoutFormsSenses(word)?.senses).toEqual([{ partsOfSpeech: ['n'], definitions: ['library'] }]);
    expect(withoutFormsSenses({ senses: [{ tags: ['forms'], definitions: [FORMS_TEXT] }] })).toBeNull();
    const clean = { senses: [{ partsOfSpeech: ['n'], definitions: ['library'] }] };
    expect(withoutFormsSenses(clean)).toBe(clean);
  });
});

describe('lookup results never carry the forms table', () => {
  it('the app lookup shape', () => {
    const mapped = lookupResultToDictResult(result([entry()]));
    expect(mapped.entries).toHaveLength(1);
    expect(mapped.entries[0].senses.map((s) => s.definitions)).toEqual([['library']]);
    expect(JSON.stringify(mapped)).not.toContain('★');
  });

  it('the per-language shape the extension /v1/scan and /v1/lookup answer with', () => {
    const formsOnly = entry({
      headwordId: 2,
      senses: [{ pos: [], tags: ['forms'], glosses: [{ lang: 'en', text: FORMS_TEXT }] }],
    });
    const mapped = lookupResultToPerLanguageDictResult(result([entry(), formsOnly]));
    expect(mapped.entries).toHaveLength(1);
    expect(mapped.entries[0].senses.flatMap((s) => s.definitions)).toEqual(['library']);
  });
});
