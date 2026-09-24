// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CATALOGS, en } from '../i18n/catalogs/all';
import { UI_LANGS } from '../i18n/core';
import { DICTIONARY_KIND_LABEL_KEYS } from '../dictionarySources';

/**
 * Every `dictionaries.kind` any writer in this repo stores, with the writer that
 * stores it. Keeping the list here rather than scraping the SQL means a new
 * importer's kind has to be added deliberately — and the assertion below then
 * refuses the commit until it also has a label.
 */
const KINDS_WRITTEN = {
  term: 'dictionary/migrate.ts (legacy terms) + the cedict/dsl/stardict/wiktextract importers',
  pitch: 'dictionary/migrate.ts, a legacy store with hasPitch and no terms',
  freq: 'dictionary/migrate.ts, a legacy frequency-only store',
  ipa: 'dictionary/migrate.ts, a Yomitan IPA-only store',
  name: 'importers/jmnedict.ts',
  character: 'importers/kanjidic.ts',
  examples: 'importers/tatoeba.ts',
};

describe('dictionary kind labels', () => {
  it('names every kind a writer can store', () => {
    expect(Object.keys(DICTIONARY_KIND_LABEL_KEYS).sort()).toEqual(Object.keys(KINDS_WRITTEN).sort());
  });

  it('resolves in all four languages, with no locale falling back to English', () => {
    for (const key of Object.values(DICTIONARY_KIND_LABEL_KEYS)) {
      for (const lang of UI_LANGS) {
        const value = CATALOGS[lang][key];
        expect(value, `${key} missing from ${lang}`).toBeTruthy();
        if (lang !== 'en') expect(value, `${key} untranslated in ${lang}`).not.toBe(en[key]);
      }
    }
  });

  it('leaves an unmapped kind to fall back to the raw column value', () => {
    // The Settings row prints `DICTIONARY_KIND_LABEL_KEYS[kind] ?? kind`. The
    // schema comment lists kinds nothing writes yet; the map must not claim them,
    // because a lookup that quietly resolved would be naming a row wrongly.
    expect(DICTIONARY_KIND_LABEL_KEYS.collocation).toBeUndefined();
    expect(DICTIONARY_KIND_LABEL_KEYS.char).toBeUndefined();
  });
});
