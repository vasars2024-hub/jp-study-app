// @vitest-environment node
//
// The claim under test: "semantic neighbors" are *grounded*. Every returned word
// carries a gloss string the queried word also carries, word for word — not a
// similarity estimate, and not a substring of a longer definition.
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
import { findSemanticNeighbors } from '../dictionary/dictService';
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

const term = (word: string, reading: string, definitions: string[]) => ([{
  word,
  reading,
  score: 1,
  senses: [{ partsOfSpeech: ['n'], definitions, tags: [] }],
}]);

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-neighbors-'));
  db = openDictionaryDb({ dir: path.join(tempRoot, 'dictionary') });
  importLegacyIndex(db, {
    version: 1,
    info: INFO(),
    terms: {
      猫: term('猫', 'ねこ', ['cat']),
      ねこ: term('猫', 'ねこ', ['cat']),
      // JMdict really does carry the katakana spelling as its own headword, and
      // live probing found it ranked first as a "neighbour" of 猫 before the
      // word key folded kana.
      ネコ: term('ネコ', 'ネコ', ['cat']),
      山猫: term('山猫', 'やまねこ', ['wildcat', 'cat']),
      子猫: term('子猫', 'こねこ', ['kitten', 'cat']),
      // The phrase "cat" occurs inside this gloss but is not the whole gloss, so
      // an FTS-only implementation would return it and this one must not.
      猫背: term('猫背', 'ねこぜ', ['stoop like a cat']),
      犬: term('犬', 'いぬ', ['dog']),
    },
  });
});

afterEach(() => {
  if (db && db.open) db.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('findSemanticNeighbors', () => {
  it('returns words that carry the whole gloss, and states which gloss links them', () => {
    const result = findSemanticNeighbors(db, { text: '猫', sourceLangs: ['ja'] });
    expect(result.probedSenses).toEqual(['cat']);
    expect(result.neighbors.map((item) => item.text).sort()).toEqual(['子猫', '山猫']);
    for (const neighbor of result.neighbors) {
      expect(neighbor.sharedSenses).toEqual(['cat']);
      expect(neighbor.dictTitle).toBe('JMdict (English)');
    }
  });

  it('rejects a gloss that merely contains the phrase', () => {
    const result = findSemanticNeighbors(db, { text: '猫', sourceLangs: ['ja'] });
    expect(result.neighbors.map((item) => item.text)).not.toContain('猫背');
  });

  it('does not offer the queried word back in another script', () => {
    for (const text of ['猫', 'ねこ', 'ネコ']) {
      const result = findSemanticNeighbors(db, { text, sourceLangs: ['ja'] });
      expect(result.neighbors.map((item) => item.text)).not.toContain('ネコ');
      expect(result.neighbors.map((item) => item.text).sort()).toEqual(['子猫', '山猫']);
    }
  });

  it('keeps a homophone, which shares a reading but is a different word', () => {
    importLegacyIndex(db, {
      version: 1,
      info: INFO({ id: 'homophone-en', title: 'Homophones', priority: 4 }),
      terms: {
        神: term('神', 'かみ', ['spirit']),
        紙: term('紙', 'かみ', ['spirit']),
      },
    });
    // Excluding by shared reading would drop 紙 from 神's neighbours even though
    // they are unrelated words that happen to sound alike.
    expect(findSemanticNeighbors(db, { text: '神', sourceLangs: ['ja'] })
      .neighbors.map((item) => item.text)).toEqual(['紙']);
  });

  it('excludes the queried word itself, reached by its reading', () => {
    const result = findSemanticNeighbors(db, { text: 'ねこ', sourceLangs: ['ja'] });
    expect(result.neighbors.map((item) => item.text)).not.toContain('猫');
    expect(result.neighbors.map((item) => item.text).sort()).toEqual(['子猫', '山猫']);
  });

  it('returns nothing when a word shares no gloss with anything', () => {
    const result = findSemanticNeighbors(db, { text: '犬', sourceLangs: ['ja'] });
    expect(result.probedSenses).toEqual(['dog']);
    expect(result.neighbors).toEqual([]);
  });

  it('returns nothing for an unknown word rather than guessing', () => {
    expect(findSemanticNeighbors(db, { text: '存在しない語', sourceLangs: ['ja'] })).toEqual({
      query: '存在しない語',
      probedSenses: [],
      neighbors: [],
    });
  });

  it('does not report neighbours supplied only by a disabled dictionary', () => {
    importLegacyIndex(db, {
      version: 1,
      info: INFO({ id: 'extra-en', title: 'Extra', priority: 5 }),
      terms: { 家猫: term('家猫', 'いえねこ', ['cat']) },
    });
    expect(findSemanticNeighbors(db, { text: '猫', sourceLangs: ['ja'] })
      .neighbors.map((item) => item.text)).toContain('家猫');

    db.prepare('update dictionaries set enabled = 0 where id = ?').run('extra-en');
    expect(findSemanticNeighbors(db, { text: '猫', sourceLangs: ['ja'] })
      .neighbors.map((item) => item.text)).not.toContain('家猫');
  });

  it('honours a gloss-language filter', () => {
    importLegacyIndex(db, {
      version: 1,
      info: INFO({ id: 'jmdict-ru', title: 'JMdict (Russian)', priority: 1, glossLangs: ['ru'] }),
      terms: {
        猫: term('猫', 'ねこ', ['кошка']),
        子猫: term('子猫', 'こねこ', ['кошка']),
      },
    });
    const russian = findSemanticNeighbors(db, {
      text: '猫',
      sourceLangs: ['ja'],
      glossLangs: ['ru'],
    });
    expect(russian.probedSenses).toEqual(['кошка']);
    expect(russian.neighbors.map((item) => item.text)).toEqual(['子猫']);
  });
});
