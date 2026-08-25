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
import { COMPOUND_SCAN_ROWS, HEADWORD_SCAN_CHUNK_ROWS } from '../../shared/lexiconCompounds';
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
  it('returns headwords that literally contain the query, most common first', async () => {
    const result = await findLexiconCompounds(db, { text: '猫', sourceLangs: ['ja'] });
    expect(result.query).toBe('猫');
    expect(result.compounds.map((item) => item.text)).toEqual(['子猫', '猫背', '愛猫']);
    for (const compound of result.compounds) {
      expect(compound.text).toContain('猫');
      expect(compound.dictTitle).toBe('JMdict (English)');
    }
  });

  it('carries the dictionary’s own first gloss for each compound', async () => {
    const result = await findLexiconCompounds(db, { text: '猫', sourceLangs: ['ja'] });
    expect(result.compounds.map((item) => item.gloss)).toEqual(['kitten', 'stoop', 'one’s beloved cat']);
  });

  it('never offers the queried word back, in any of its scripts', async () => {
    for (const text of ['猫', 'ねこ', 'ネコ']) {
      const result = await findLexiconCompounds(db, { text, sourceLangs: ['ja'] });
      expect(result.compounds.map((item) => item.text)).not.toContain('猫');
      expect(result.compounds.map((item) => item.text)).not.toContain('ネコ');
    }
  });

  it('excludes a word that does not contain the query at all', async () => {
    const result = await findLexiconCompounds(db, { text: '猫', sourceLangs: ['ja'] });
    expect(result.compounds.map((item) => item.text)).not.toContain('犬');
  });

  it('answers nothing for a query that is not a headword, without scanning', async () => {
    const result = await findLexiconCompounds(db, { text: 'ｘｙｚ', sourceLangs: ['ja'] });
    expect(result.compounds).toEqual([]);
  });

  it('answers nothing for an empty query', async () => {
    expect(await findLexiconCompounds(db, { text: '   ' })).toEqual({ query: '', compounds: [] });
  });

  it('honours the requested result limit', async () => {
    const result = await findLexiconCompounds(db, { text: '猫', sourceLangs: ['ja'], limit: 1 });
    expect(result.compounds.map((item) => item.text)).toEqual(['子猫']);
  });

  // The existence probe must not inherit the gloss filter: `lookup` discards a
  // headword whose every sense that filter removed, so an inherited one would
  // answer "no compounds" to a reader who merely asked for Russian definitions.
  it('leaves the gloss off a compound with none in the requested language', async () => {
    const result = await findLexiconCompounds(db, { text: '猫', sourceLangs: ['ja'], glossLangs: ['ru'] });
    expect(result.compounds.map((item) => item.text)).toEqual(['子猫', '猫背', '愛猫']);
    for (const compound of result.compounds) expect(compound.gloss).toBeUndefined();
  });
});

// `instr` over `norm` is evaluated off `idx_hw_norm`, so the visit is an index
// scan of the whole `lang` partition and no `limit` under an `ORDER BY` can stop
// it. What is under test here is that the visit is spent in event-loop-sized
// windows, that windowing it changed nothing about which compounds come back, and
// that the ranking survives being moved out of SQL.
describe('the headword scan is walked in chunks', () => {
  // Three full windows and a remainder, with every match in the LAST one — an
  // implementation that reads a single window and stops returns nothing here.
  const FILLER_ROWS = HEADWORD_SCAN_CHUNK_ROWS * 3 + 11;

  // The window boundary is a `norm` value, not a rowid, so "last window" means
  // "sorts last by norm". Every filler norm starts with a digit and every match
  // with 猫 (U+732B), which sorts above every ASCII digit — and the fillers are
  // inserted in DESCENDING id order so that a scan which happened to follow the
  // rowid would visit them in the opposite order and rank them differently.
  function importWideIndex(): void {
    const insert = db.prepare(`insert into headwords (id,dict_id,lang,text,norm,reading,reading_norm,score)
      values (?, 'jmdict-en', 'ja', ?, ?, ?, ?, ?)`);
    db.transaction(() => {
      for (let i = FILLER_ROWS; i >= 1; i -= 1) {
        const text = `${String(i).padStart(7, '0')}語`;
        insert.run(1000 + i, text, text, 'よみ', 'よみ', 0);
      }
    })();
  }

  it('finds compounds that live past the first window', async () => {
    importWideIndex();
    const result = await findLexiconCompounds(db, { text: '猫', sourceLangs: ['ja'] });
    expect((db.prepare('select count(*) as count from headwords').get() as { count: number }).count)
      .toBe(FILLER_ROWS + 7);
    expect(result.compounds.map((item) => item.text)).toEqual(['子猫', '猫背', '愛猫']);
  });

  it('returns exactly what one unwindowed scan of the same index returns', async () => {
    importWideIndex();
    const windowed = await findLexiconCompounds(db, { text: '猫', sourceLangs: ['ja'] });
    // The statement this replaced, run verbatim as the reference — including the
    // `ORDER BY` whose temp B-tree is the whole reason it had to go.
    const reference = db.prepare(`
      select h.text from headwords h indexed by idx_hw_norm
      join dictionaries d on d.id = h.dict_id
      where h.lang in ('ja') and d.enabled = 1 and instr(h.norm, ?) > 0
      order by h.score desc, length(h.text) asc, h.id asc
      limit ?
    `).all('猫', COMPOUND_SCAN_ROWS) as { text: string }[];
    // Asserted before the comparison, so an empty windowed result — which is
    // exactly what a scan that stops after one window produces — cannot pass
    // vacuously.
    expect(reference.map((row) => row.text)).toEqual(['猫', '子猫', '猫背', '愛猫']);
    // The windowed walk is the old statement's result with the query itself
    // dropped, in the same order — which is the identity claim, not a coincidence
    // of this fixture: `selectLexiconCompounds` is the only thing between them.
    expect(windowed.compounds.map((item) => item.text))
      .toEqual(reference.map((row) => row.text).filter((text) => text !== '猫'));
    expect(windowed.compounds).toHaveLength(3);
  });

  // The load-bearing one. A ticker that only advances when the event loop turns
  // counts the windows: chunked, it sees at least one turn per boundary; one
  // synchronous scan starves it completely. Delete the `await new Promise` yield
  // in `scanHeadwordsContaining` and this goes red at 0.
  it('gives the event loop a turn between windows', async () => {
    importWideIndex();
    let turns = 0;
    let running = true;
    const tick = (): void => {
      if (!running) return;
      turns += 1;
      setImmediate(tick);
    };
    setImmediate(tick);
    // Let the ticker arm before the scan starts, so its first turn is not the one
    // the scan itself would have yielded.
    await new Promise<void>((resolve) => { setImmediate(resolve); });
    const armed = turns;

    await findLexiconCompounds(db, { text: '猫', sourceLangs: ['ja'] });
    running = false;

    const windows = Math.ceil((FILLER_ROWS + 7) / HEADWORD_SCAN_CHUNK_ROWS);
    expect(windows).toBe(4);
    expect(turns - armed).toBeGreaterThanOrEqual(windows - 1);
  });
});
