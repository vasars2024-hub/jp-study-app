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
  setDictionarySourceLang,
} from '../dictionary/service';
import { GLOBAL_PAIR, normalizeSourceLang } from '../../shared/dictionarySources';

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

describe('correcting the language a source was imported under', () => {
  let db: SqliteDb;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-dict-source-lang-'));
    db = openDictionaryDb({ dir: tempRoot });
    const insert = db.prepare(
      'insert into dictionaries (id, title, source_lang, target_langs, priority) values (?, ?, ?, ?, ?)',
    );
    // A Chinese archive a user imported themselves: the legacy format declares no
    // source language, so it landed under the Japanese default like every other.
    insert.run('user-zh', 'Some Chinese dictionary', 'ja', 'zh', 0);
    insert.run('other', 'A real Japanese dictionary', 'ja', 'en', 1);
    db.prepare('insert into headwords (dict_id, lang, text, norm, reading, reading_norm) values (?, ?, ?, ?, ?, ?)')
      .run('user-zh', 'ja', '熊貓', '熊貓', '', '');
    db.prepare('insert into headwords (dict_id, lang, text, norm, reading, reading_norm) values (?, ?, ?, ?, ?, ?)')
      .run('other', 'ja', '猫', '猫', 'ねこ', 'ねこ');
    db.prepare('insert into pitch (dict_id, lang, norm, reading, positions) values (?, ?, ?, ?, ?)')
      .run('user-zh', 'ja', '熊貓', 'ㄒㄩㄥˊ', '0');
    db.prepare('insert into freq_corpora (lang, norm, corpus, rank) values (?, ?, ?, ?)')
      .run('ja', '熊貓', 'user-zh', 12);
  });
  afterEach(() => { db.close(); fs.rmSync(tempRoot, { recursive: true, force: true }); });

  const langOf = (table: string, column = 'dict_id', id = 'user-zh'): string[] =>
    (db.prepare(`select lang from ${table} where ${column} = ?`).all(id) as Array<{ lang: string }>)
      .map((row) => row.lang);

  it('relabels every row the source owns, and only that source', () => {
    expect(setDictionarySourceLang('user-zh', 'zh', db)).toMatchObject({ ok: true });

    expect(listDictionarySources(db).find((source) => source.id === 'user-zh')?.sourceLang).toBe('zh');
    expect(langOf('headwords')).toEqual(['zh']);
    expect(langOf('pitch')).toEqual(['zh']);
    expect(langOf('freq_corpora', 'corpus')).toEqual(['zh']);
    // The untouched Japanese dictionary keeps every one of its own rows.
    expect(listDictionarySources(db).find((source) => source.id === 'other')?.sourceLang).toBe('ja');
    expect(langOf('headwords', 'dict_id', 'other')).toEqual(['ja']);
  });

  it('makes the source answer the pair it can actually answer', () => {
    expect(listDictionaryPairs(db)).toEqual([
      { sourceLang: 'ja', targetLang: 'en' },
      { sourceLang: 'ja', targetLang: 'zh' },
    ]);
    setDictionarySourceLang('user-zh', 'zh', db);
    expect(listDictionaryPairs(db)).toEqual([
      { sourceLang: 'ja', targetLang: 'en' },
      { sourceLang: 'zh', targetLang: 'zh' },
    ]);
  });

  it('carries a pair order across, and lets the relabelled row win a collision', () => {
    const upsert = db.prepare(
      'insert into dict_pair_priority (dict_id, source_lang, target_lang, priority) values (?, ?, ?, ?)',
    );
    upsert.run('user-zh', 'ja', 'zh', 3);
    // A stale row already sitting on the destination pair. It cannot have been
    // chosen deliberately — no zh headword of this dictionary existed to order.
    upsert.run('user-zh', 'zh', 'zh', 9);
    setDictionarySourceLang('user-zh', 'zh', db);
    const rows = db
      .prepare('select source_lang, target_lang, priority from dict_pair_priority where dict_id = ?')
      .all('user-zh');
    expect(rows).toEqual([{ source_lang: 'zh', target_lang: 'zh', priority: 3 }]);
  });

  it('moves a character source and rebuilds the projection it fed', () => {
    db.prepare(`insert into char_sources (dict_id, lang, char, strokes, radical, components, readings, meanings)
                values (?, 'ja', ?, ?, ?, '[]', '[]', '[]')`).run('user-zh', '熊', 14, '86');
    db.prepare(`insert into chars (lang, char, strokes, primary_source_id, source_ids)
                values ('ja', ?, ?, ?, ?)`).run('熊', 14, 'user-zh', '["user-zh"]');

    setDictionarySourceLang('user-zh', 'zh', db);

    expect(langOf('char_sources')).toEqual(['zh']);
    // `chars` is a Japanese-only projection, so a source that is no longer
    // Japanese must stop appearing in it rather than linger as a stale row.
    expect(db.prepare(`select count(*) c from chars where lang = 'ja' and char = ?`).get('熊'))
      .toEqual({ c: 0 });
  });

  it('refuses anything that is not a language code, and writes nothing', () => {
    for (const bad of ['', ' ', 'ja-JP', 'j', 'jpan', 'z h', '中文', 7, null, undefined, ['zh'], {}]) {
      expect(setDictionarySourceLang('user-zh', bad, db)).toMatchObject({ ok: false, error: 'invalid-lang' });
    }
    expect(langOf('headwords')).toEqual(['ja']);
    expect(listDictionarySources(db).find((source) => source.id === 'user-zh')?.sourceLang).toBe('ja');
  });

  it('is honest about a source that is not there, and quiet about one already correct', () => {
    expect(setDictionarySourceLang('missing', 'zh', db)).toMatchObject({ ok: false, error: 'not-found' });
    // Re-sending the language a source already has is the state the caller asked
    // for, so it succeeds — a `<select>` re-emitting its own value is not a fault.
    expect(setDictionarySourceLang('other', 'ja', db)).toMatchObject({ ok: true });
    expect(langOf('headwords', 'dict_id', 'other')).toEqual(['ja']);
  });

  it('normalizes case and whitespace, and accepts the three-letter codes already in the database', () => {
    expect(normalizeSourceLang(' JA ')).toBe('ja');
    expect(normalizeSourceLang('und')).toBe('und');
    expect(normalizeSourceLang('yue')).toBe('yue');
    expect(setDictionarySourceLang('user-zh', ' ZH ', db)).toMatchObject({ ok: true });
    expect(langOf('headwords')).toEqual(['zh']);
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
