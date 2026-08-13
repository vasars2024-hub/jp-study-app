// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tempRoot = '';
vi.mock('electron', () => ({ app: { getPath: () => tempRoot } }));

import { openDictionaryDb, type SqliteDb } from '../dictionary/db';
import {
  dictionaryPairHasOverride,
  listDictionaryPairs,
  listDictionarySources,
  moveDictionarySource,
  moveDictionarySourceInPair,
  removeDictionarySource,
  resetDictionaryPairPriority,
  setDictionarySourceEnabled,
} from '../dictionary/service';
import { GLOBAL_PAIR } from '../../shared/dictionarySources';

describe('dictionary source controls', () => {
  let db: SqliteDb;
  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-dict-sources-'));
    db = openDictionaryDb({ dir: tempRoot });
    const insert = db.prepare('insert into dictionaries (id, title, source_lang, licence, attribution, priority) values (?, ?, ?, ?, ?, ?)');
    insert.run('a', 'Alpha', 'ja', 'CC BY-SA 4.0', 'Alpha Project', 0);
    insert.run('b', 'Beta', 'zh', '', '', 0);
  });
  afterEach(() => { db.close(); fs.rmSync(tempRoot, { recursive: true, force: true }); });

  it('lists, disables, reorders equal-priority rows, and removes with truthful results', () => {
    expect(listDictionarySources(db).map((source) => source.id)).toEqual(['a', 'b']);
    expect(listDictionarySources(db)[0]).toMatchObject({
      licence: 'CC BY-SA 4.0',
      attribution: 'Alpha Project',
    });
    expect(setDictionarySourceEnabled('a', false, db).sources[0].enabled).toBe(false);
    expect(moveDictionarySource('b', -1, db).sources.map((source) => source.id)).toEqual(['b', 'a']);
    expect(moveDictionarySource('b', -1, db)).toMatchObject({ ok: false, error: 'edge' });
    expect(removeDictionarySource('b', db).sources.map((source) => source.id)).toEqual(['a']);
    expect(removeDictionarySource('missing', db)).toMatchObject({ ok: false, error: 'not-found' });
  });
});

describe('per-language-pair source order', () => {
  let db: SqliteDb;
  const JA_EN = { sourceLang: 'ja', targetLang: 'en' };
  const ZH_EN = { sourceLang: 'zh', targetLang: 'en' };

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-dict-pairs-'));
    db = openDictionaryDb({ dir: tempRoot });
    const insert = db.prepare(
      'insert into dictionaries (id, title, source_lang, target_langs, priority) values (?, ?, ?, ?, ?)',
    );
    insert.run('a', 'Alpha', 'ja', 'en,ru', 0);
    insert.run('b', 'Beta', 'ja', 'en', 1);
    insert.run('c', 'Gamma', 'zh', 'en', 2);
  });
  afterEach(() => { db.close(); fs.rmSync(tempRoot, { recursive: true, force: true }); });

  it('offers every pair the installed sources declare, deduplicated and sorted', () => {
    expect(listDictionaryPairs(db)).toEqual([
      { sourceLang: 'ja', targetLang: 'en' },
      { sourceLang: 'ja', targetLang: 'ru' },
      { sourceLang: 'zh', targetLang: 'en' },
    ]);
  });

  it('starts every pair on the global order', () => {
    expect(listDictionarySources(db, JA_EN).map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(dictionaryPairHasOverride(JA_EN, db)).toBe(false);
  });

  it('reorders one pair without moving the global order or any other pair', () => {
    expect(moveDictionarySourceInPair('b', -1, JA_EN, db).sources.map((s) => s.id))
      .toEqual(['b', 'a', 'c']);
    expect(dictionaryPairHasOverride(JA_EN, db)).toBe(true);

    expect(listDictionarySources(db).map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(listDictionarySources(db, ZH_EN).map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(dictionaryPairHasOverride(ZH_EN, db)).toBe(false);
  });

  it('materialises the whole pair so a later global reorder cannot scramble it', () => {
    moveDictionarySourceInPair('b', -1, JA_EN, db);
    // Global move of an unrelated source. Without materialisation 'a' and 'c'
    // would still be reading dictionaries.priority and would jump.
    moveDictionarySource('c', -1, db);
    expect(listDictionarySources(db, JA_EN).map((s) => s.id)).toEqual(['b', 'a', 'c']);
  });

  it('refuses to move past either end and reports which', () => {
    expect(moveDictionarySourceInPair('a', -1, JA_EN, db)).toMatchObject({ ok: false, error: 'edge' });
    expect(moveDictionarySourceInPair('c', 1, JA_EN, db)).toMatchObject({ ok: false, error: 'edge' });
    expect(moveDictionarySourceInPair('missing', 1, JA_EN, db)).toMatchObject({ ok: false, error: 'not-found' });
    // A failed move must not have written a partial order.
    expect(dictionaryPairHasOverride(JA_EN, db)).toBe(false);
  });

  it('resets a pair back to the global order', () => {
    moveDictionarySourceInPair('b', -1, JA_EN, db);
    const reset = resetDictionaryPairPriority(JA_EN, db);
    expect(reset.ok).toBe(true);
    expect(reset.sources.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(dictionaryPairHasOverride(JA_EN, db)).toBe(false);
    // Resetting a pair that had no order of its own is honest about doing nothing.
    expect(resetDictionaryPairPriority(JA_EN, db).ok).toBe(false);
  });

  it('treats the global pair as the global order, not as a pair to override', () => {
    expect(moveDictionarySourceInPair('b', -1, GLOBAL_PAIR, db).sources.map((s) => s.id))
      .toEqual(['b', 'a', 'c']);
    const left = db.prepare('select count(*) c from dict_pair_priority').get() as { c: number };
    expect(left.c).toBe(0);
    expect(resetDictionaryPairPriority(GLOBAL_PAIR, db).ok).toBe(false);
  });
});
