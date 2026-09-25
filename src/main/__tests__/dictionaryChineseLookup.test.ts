// @vitest-environment node
//
// Phase 4's Chinese surface. The claim under test is the one that makes the
// swap safe rather than merely done: the renderer's engine is gone, but on an
// installation whose database has no Chinese dictionary the surfaces must still
// answer — from CC-CEDICT, in main. A half-swapped surface that silently
// returns nothing is the specific failure these tests exist to prevent.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tempRoot = '';

vi.mock('electron', () => ({
  app: { getPath: () => tempRoot },
}));

import { openDictionaryDb, type SqliteDb } from '../dictionary/db';
import { importCedict } from '../dictionary/importers/cedict';
import { importLegacyIndex } from '../dictionary/migrate';
import {
  buildCedictIndex,
  hasHanText,
  lookupCedictIndex,
  lookupChineseInDb,
  lookupChineseTerm,
  resetCedictIndexCache,
  type ChineseLookupDeps,
} from '../dictionary/chineseLookup';
import type { YomitanDictInfo } from '../../shared/types';

let db: SqliteDb;

const CEDICT_TEXT = [
  '# CC-CEDICT sample',
  '傳統 传统 [chuan2 tong3] /tradition/traditional/',
  '狗 狗 [gou3] /dog/CL:隻|只[zhi1],條|条[tiao2]/',
  '貓 猫 [mao1] /cat/CL:隻|只[zhi1]/',
  '傳統文化 传统文化 [chuan2 tong3 wen2 hua4] /traditional culture/',
].join('\n');

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

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-zhlookup-'));
  db = openDictionaryDb({ dir: path.join(tempRoot, 'dictionary') });
  resetCedictIndexCache();
});

afterEach(() => {
  if (db && db.open) db.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
  resetCedictIndexCache();
});

describe('the CC-CEDICT fallback engine', () => {
  it('resolves an exact simplified headword', () => {
    const result = lookupCedictIndex(buildCedictIndex(CEDICT_TEXT), '传统');
    expect(result.entries[0].word).toBe('传统');
    expect(result.entries[0].senses[0].definitions).toEqual(['tradition', 'traditional']);
  });

  it('resolves a traditional headword to the same entry, written the way it was asked', () => {
    const result = lookupCedictIndex(buildCedictIndex(CEDICT_TEXT), '傳統');
    // The same entry (its senses), in the learner's own script — it used to
    // come back as Simplified 传统 whatever was typed.
    expect(result.entries[0].word).toBe('傳統');
    expect(result.entries[0].senses[0].definitions).toEqual(['tradition', 'traditional']);
  });

  it('renders tone marks rather than tone digits', () => {
    const result = lookupCedictIndex(buildCedictIndex(CEDICT_TEXT), '传统');
    expect(result.entries[0].reading).toBe('chuán tǒng');
  });

  it('falls back to the longest matching prefix of a reader selection', () => {
    // The reader hands over a word plus a trailing character; the old renderer
    // engine chopped from the right until something matched, and so must this.
    const result = lookupCedictIndex(buildCedictIndex(CEDICT_TEXT), '传统的');
    expect(result.entries[0].word).toBe('传统');
  });

  it('searches English glosses in the reverse direction', () => {
    const result = lookupCedictIndex(buildCedictIndex(CEDICT_TEXT), 'dog');
    expect(result.entries.map((e) => e.word)).toContain('狗');
  });

  it('returns an empty result for an empty query rather than throwing', () => {
    expect(lookupCedictIndex(buildCedictIndex(CEDICT_TEXT), '   ')).toEqual({ query: '', entries: [] });
  });

  it('skips comments and malformed lines', () => {
    const index = buildCedictIndex(['# comment', 'garbage', ...CEDICT_TEXT.split('\n')].join('\n'));
    expect(index.all).toHaveLength(4);
  });

  it('detects Han text', () => {
    expect(hasHanText('传统')).toBe(true);
    expect(hasHanText('tradition')).toBe(false);
  });
});

describe('the database side', () => {
  it('returns null when no Chinese dictionary has been imported', () => {
    // This is the whole reason the fallback exists. `null`, not an empty
    // result: "nothing imported" must fall through, "no such word" must not.
    expect(lookupChineseInDb(db, '传统')).toBeNull();
  });

  it('answers from the database once CC-CEDICT is imported', () => {
    importCedict(db, CEDICT_TEXT, { dictId: 'cc-cedict' });
    const result = lookupChineseInDb(db, '传统');
    expect(result?.entries[0].word).toBe('传统');
    expect(result?.entries[0].senses[0].definitions).toEqual(['tradition', 'traditional']);
  });

  it('resolves a traditional headword through variant_of', () => {
    importCedict(db, CEDICT_TEXT, { dictId: 'cc-cedict' });
    const result = lookupChineseInDb(db, '傳統');
    expect(result?.entries[0].senses[0].definitions).toContain('tradition');
  });

  it('answers a toneless-pinyin query, which the renderer engine could not', () => {
    importCedict(db, CEDICT_TEXT, { dictId: 'cc-cedict' });
    const result = lookupChineseInDb(db, 'chuantong');
    expect(result?.entries.map((e) => e.word)).toContain('传统');
  });

  it('never returns Japanese entries on the Chinese surface', () => {
    // `lookup()`'s reverse gloss direction is not language-pinned, so an
    // English query reaches JMdict too. On this surface that is wrong.
    importLegacyIndex(db, {
      version: 1,
      info: INFO(),
      terms: {
        犬: [{ word: '犬', reading: 'いぬ', score: 5, senses: [{ partsOfSpeech: ['n'], definitions: ['dog'], tags: [] }] }],
      },
    });
    importCedict(db, CEDICT_TEXT, { dictId: 'cc-cedict', priority: 1 });
    const result = lookupChineseInDb(db, 'dog');
    expect(result?.entries.map((e) => e.word)).toContain('狗');
    expect(result?.entries.map((e) => e.word)).not.toContain('犬');
  });

  it('returns null for a word in no dictionary, so the fallback still gets a turn', () => {
    importCedict(db, CEDICT_TEXT, { dictId: 'cc-cedict' });
    expect(lookupChineseInDb(db, '龘龘龘')).toBeNull();
  });
});

describe('lookupChineseTerm — database first, CC-CEDICT second', () => {
  const deps = (over: Partial<ChineseLookupDeps> = {}): ChineseLookupDeps => ({
    db: () => db,
    loadCedictText: async () => CEDICT_TEXT,
    ...over,
  });

  it('uses the database when it has the word', async () => {
    importCedict(db, CEDICT_TEXT, { dictId: 'cc-cedict', title: 'From the database' });
    const result = await lookupChineseTerm('传统', deps());
    // The adapter stamps the source dictionary title; the file fallback cannot.
    expect(result.entries[0].source).toBe('From the database');
  });

  it('falls back to CC-CEDICT when the database is empty', async () => {
    const result = await lookupChineseTerm('传统', deps());
    expect(result.entries[0].word).toBe('传统');
    expect(result.entries[0].source).toBeUndefined();
  });

  it('falls back when the database cannot be opened at all', async () => {
    const result = await lookupChineseTerm('传统', deps({ db: () => null }));
    expect(result.entries[0].word).toBe('传统');
  });

  it('falls back when a database read throws', async () => {
    const result = await lookupChineseTerm('传统', deps({
      db: () => { throw new Error('database is locked'); },
    }));
    expect(result.entries[0].word).toBe('传统');
  });

  it('reports a load failure as an error rather than as "no results"', async () => {
    const result = await lookupChineseTerm('传统', deps({
      loadCedictText: async () => { throw new Error('missing cedict.u8'); },
    }));
    expect(result.entries).toEqual([]);
    expect(result.error).toBe('missing cedict.u8');
  });

  it('parses CC-CEDICT once and reuses the index', async () => {
    const loadCedictText = vi.fn(async () => CEDICT_TEXT);
    await lookupChineseTerm('传统', deps({ loadCedictText }));
    await lookupChineseTerm('狗', deps({ loadCedictText }));
    expect(loadCedictText).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed load, so a later install is picked up', async () => {
    let fail = true;
    const loadCedictText = vi.fn(async () => {
      if (fail) throw new Error('not installed yet');
      return CEDICT_TEXT;
    });
    const failed = await lookupChineseTerm('传统', deps({ loadCedictText }));
    expect(failed.entries).toEqual([]);
    fail = false;
    const ok = await lookupChineseTerm('传统', deps({ loadCedictText }));
    expect(ok.entries[0].word).toBe('传统');
  });

  it('re-reads CC-CEDICT after the cache is reset', async () => {
    const loadCedictText = vi.fn(async () => CEDICT_TEXT);
    await lookupChineseTerm('传统', deps({ loadCedictText }));
    resetCedictIndexCache();
    await lookupChineseTerm('传统', deps({ loadCedictText }));
    expect(loadCedictText).toHaveBeenCalledTimes(2);
  });

  it('returns an empty result for a blank query without touching either source', async () => {
    const loadCedictText = vi.fn(async () => CEDICT_TEXT);
    expect(await lookupChineseTerm('  ', deps({ loadCedictText }))).toEqual({ query: '', entries: [] });
    expect(loadCedictText).not.toHaveBeenCalled();
  });

  it('survives an FTS-operator query, which is ordinary English input', async () => {
    importCedict(db, CEDICT_TEXT, { dictId: 'cc-cedict' });
    await expect(lookupChineseTerm('to run (away)', deps())).resolves.toBeTruthy();
  });
});

describe('Traditional Chinese', () => {
  it('a Traditional query, or a Traditional learner, sees the Traditional headword', () => {
    const index = buildCedictIndex(CEDICT_TEXT);
    expect(lookupCedictIndex(index, '傳統').entries[0]?.word).toBe('傳統');
    expect(lookupCedictIndex(index, '传统').entries[0]?.word).toBe('传统');
    expect(lookupCedictIndex(index, 'tradition', 'traditional').entries[0]?.word).toBe('傳統');
    expect(lookupCedictIndex(index, 'tradition').entries[0]?.word).toBe('传统');
  });
});
