// @vitest-environment node
//
// The claim under test: "words containing this one" is *literal*. Every returned
// headword contains the query as a substring of its written form, the query is
// never returned as its own compound, and the order is the importer's own
// commonness score rather than whatever the index happens to yield first.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tempRoot = '';

vi.mock('electron', () => ({
  app: { getPath: () => tempRoot },
}));

import { openDictionaryDb, type SqliteDb } from '../dictionary/db';
import { importLegacyIndex } from '../dictionary/migrate';
import { findLexiconCompounds } from '../dictionary/dictService';
import type { YomitanDictInfo } from '../../shared/types';

let db: SqliteDb;

const INFO = (over: Partial<YomitanDictInfo> = {}): YomitanDictInfo => ({
  id: 'jmdict-en',
  title: 'JMdict (English)',
  revision: '1',
  priority: 0,
  hasTerms: true,
  hasPitch: false,
  hasFreq: false,
  importedAt: 0,
  glossLangs: ['en'],
  ...over,
});

const term = (word: string, reading: string, definitions: string[], score = 0) => ([{
  word,
  reading,
  score,
  senses: [{ partsOfSpeech: ['n'], definitions, tags: [] }],
}]);

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-compounds-'));
  db = openDictionaryDb({ dir: path.join(tempRoot, 'dictionary') });
  importLegacyIndex(db, {
    version: 1,
    info: INFO(),
    terms: {
      // The scores are the shape the real JMdict import writes: a priority-tagged
      // entry lands near 10^6 and an untagged one at or below zero.
      //
      // Insertion order is deliberately the **reverse** of the expected order.
      // With the compounds inserted most-common-first, dropping the `ORDER BY`
      // from the query left every assertion below green — the row ids alone
      // happened to reproduce the ranking, so the ranking was not under test.
      猫: term('猫', 'ねこ', ['cat'], 1999800),
      ねこ: term('猫', 'ねこ', ['cat'], 1999800),
      ネコ: term('ネコ', 'ネコ', ['cat'], 1999800),
      愛猫: term('愛猫', 'あいびょう', ['one’s beloved cat'], -200),
      猫背: term('猫背', 'ねこぜ', ['stoop'], 999800),
      子猫: term('子猫', 'こねこ', ['kitten'], 1999800),
      犬: term('犬', 'いぬ', ['dog'], 1999800),
    },
  });
});

afterEach(() => {
  if (db && db.open) db.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('findLexiconCompounds', () => {
  it('returns headwords that literally contain the query, most common first', () => {
    const result = findLexiconCompounds(db, { text: '猫', sourceLangs: ['ja'] });
    expect(result.query).toBe('猫');
    expect(result.compounds.map((item) => item.text)).toEqual(['子猫', '猫背', '愛猫']);
    for (const compound of result.compounds) {
      expect(compound.text).toContain('猫');
      expect(compound.dictTitle).toBe('JMdict (English)');
    }
  });

  it('carries the dictionary’s own first gloss for each compound', () => {
    const result = findLexiconCompounds(db, { text: '猫', sourceLangs: ['ja'] });
    expect(result.compounds.map((item) => item.gloss)).toEqual(['kitten', 'stoop', 'one’s beloved cat']);
  });

  it('never offers the queried word back, in any of its scripts', () => {
    for (const text of ['猫', 'ねこ', 'ネコ']) {
      const result = findLexiconCompounds(db, { text, sourceLangs: ['ja'] });
      expect(result.compounds.map((item) => item.text)).not.toContain('猫');
      expect(result.compounds.map((item) => item.text)).not.toContain('ネコ');
    }
  });

  it('excludes a word that does not contain the query at all', () => {
    const result = findLexiconCompounds(db, { text: '猫', sourceLangs: ['ja'] });
    expect(result.compounds.map((item) => item.text)).not.toContain('犬');
  });

  it('answers nothing for a query that is not a headword, without scanning', () => {
    const result = findLexiconCompounds(db, { text: 'ｘｙｚ', sourceLangs: ['ja'] });
    expect(result.compounds).toEqual([]);
  });

  it('answers nothing for an empty query', () => {
    expect(findLexiconCompounds(db, { text: '   ' })).toEqual({ query: '', compounds: [] });
  });

  it('honours the requested result limit', () => {
    const result = findLexiconCompounds(db, { text: '猫', sourceLangs: ['ja'], limit: 1 });
    expect(result.compounds.map((item) => item.text)).toEqual(['子猫']);
  });

  // The existence probe must not inherit the gloss filter: `lookup` discards a
  // headword whose every sense that filter removed, so an inherited one would
  // answer "no compounds" to a reader who merely asked for Russian definitions.
  it('leaves the gloss off a compound with none in the requested language', () => {
    const result = findLexiconCompounds(db, { text: '猫', sourceLangs: ['ja'], glossLangs: ['ru'] });
    expect(result.compounds.map((item) => item.text)).toEqual(['子猫', '猫背', '愛猫']);
    for (const compound of result.compounds) expect(compound.gloss).toBeUndefined();
  });
});
