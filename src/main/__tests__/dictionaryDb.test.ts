// @vitest-environment node
//
// These run against the real better-sqlite3 that ships in the app — not a mock and
// not a different engine. That is possible because the driver is Node-API
// (docs/plans/DICTIONARY_BUILD_LOG.md), so vitest under node loads the same binary
// Electron does. An FTS5 assertion is worth nothing against a stub.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tempRoot = '';

vi.mock('electron', () => ({
  app: { getPath: () => tempRoot },
}));

import {
  closeDictionaryDb,
  dictionaryDbPath,
  dictionarySchemaIsCurrent,
  migrateDictionaryDb,
  openDictionaryDb,
  type SqliteDb,
} from '../dictionary/db';
import { DICT_FTS_TABLES, DICT_SCHEMA_VERSION, DICT_TABLES, MIGRATIONS } from '../dictionary/schema';

let db: SqliteDb;
let dir = '';

function tableNames(handle: SqliteDb): string[] {
  return (handle.prepare("select name from sqlite_master where type = 'table'").all() as { name: string }[])
    .map((row) => row.name);
}

/** A dictionary with one headword, one sense and one gloss. Returns the ids. */
function seedEntry(
  handle: SqliteDb,
  opts: { dict?: string; lang?: string; text: string; norm?: string; gloss: string; glossLang?: string },
): { dictId: string; headwordId: number; senseId: number; glossId: number } {
  const dictId = opts.dict ?? 'd1';
  const exists = handle.prepare('select 1 from dictionaries where id = ?').get(dictId);
  if (!exists) {
    handle
      .prepare('insert into dictionaries (id, title, source_lang, target_langs) values (?, ?, ?, ?)')
      .run(dictId, 'Test dict', opts.lang ?? 'ja', opts.glossLang ?? 'en');
  }
  const hw = handle
    .prepare('insert into headwords (dict_id, lang, text, norm) values (?, ?, ?, ?)')
    .run(dictId, opts.lang ?? 'ja', opts.text, opts.norm ?? opts.text);
  const headwordId = Number(hw.lastInsertRowid);
  const sense = handle.prepare('insert into senses (headword_id, ord) values (?, 0)').run(headwordId);
  const senseId = Number(sense.lastInsertRowid);
  const gloss = handle
    .prepare('insert into glosses (sense_id, lang, text, ord) values (?, ?, ?, 0)')
    .run(senseId, opts.glossLang ?? 'en', opts.gloss);
  return { dictId, headwordId, senseId, glossId: Number(gloss.lastInsertRowid) };
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-dictdb-'));
  dir = path.join(tempRoot, 'dictionary');
  db = openDictionaryDb({ dir });
});

afterEach(() => {
  if (db && db.open) db.close();
  closeDictionaryDb();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('dictionary database — opening and migrating', () => {
  it('creates the file, every table and every FTS index', () => {
    const names = tableNames(db);
    for (const table of DICT_TABLES) expect(names).toContain(table);
    for (const table of DICT_FTS_TABLES) expect(names).toContain(table);
    expect(fs.existsSync(path.join(dir, 'dict.db'))).toBe(true);
  });

  it('lands on the declared schema version', () => {
    expect(db.pragma('user_version', { simple: true })).toBe(DICT_SCHEMA_VERSION);
    expect(dictionarySchemaIsCurrent(db)).toBe(true);
  });

  it('sets the pragmas the concurrency story depends on', () => {
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('re-running the ladder is a no-op, not a second CREATE', () => {
    // The whole point of user_version: an already-migrated file must not re-run a
    // step, because `CREATE TABLE` is not idempotent and would throw.
    expect(() => migrateDictionaryDb(db)).not.toThrow();
    expect(migrateDictionaryDb(db)).toBe(DICT_SCHEMA_VERSION);
  });

  it('re-opening an existing file preserves its rows', () => {
    seedEntry(db, { text: '食べる', gloss: 'to eat' });
    db.close();
    const again = openDictionaryDb({ dir });
    expect(again.prepare('select count(*) c from headwords').get()).toEqual({ c: 1 });
    again.close();
  });

  it('reports the failing step and leaves the version behind when a migration throws', () => {
    const broken = openDictionaryDb({ dir: path.join(tempRoot, 'broken') });
    broken.pragma('user_version = 0');
    broken.exec('drop table headwords');
    MIGRATIONS.push({
      version: 999,
      name: 'deliberately invalid',
      up(handle) {
        handle.exec('this is not sql');
      },
    });
    try {
      // Version 1 re-runs first and fails on the tables that still exist, which is
      // exactly the shape a bad step has: the message must name the step.
      expect(() => migrateDictionaryDb(broken)).toThrow(/dictionary migration \d+/);
      expect(Number(broken.pragma('user_version', { simple: true }))).toBe(0);
    } finally {
      MIGRATIONS.pop();
      broken.close();
    }
  });

  it('dictionaryDbPath sits under userData', () => {
    expect(dictionaryDbPath()).toBe(path.join(tempRoot, 'dictionary', 'dict.db'));
  });
});

describe('FTS5 — the index that silently returns nothing if the triggers are wrong', () => {
  it('matches a headword inserted after the index was created', () => {
    seedEntry(db, { text: '食べる', gloss: 'to eat' });
    const hit = db.prepare('select rowid from headwords_fts where headwords_fts match ?').all('食べる');
    expect(hit).toHaveLength(1);
  });

  it('matches across scripts — CJK, Cyrillic and Latin in one index', () => {
    seedEntry(db, { text: '传统', norm: '传统', gloss: 'tradition', lang: 'zh' });
    seedEntry(db, { text: 'стол', norm: 'стол', gloss: 'table', lang: 'ru' });
    seedEntry(db, { text: 'table', norm: 'table', gloss: 'a piece of furniture', lang: 'en' });
    for (const term of ['传统', 'стол', 'table']) {
      expect(db.prepare('select rowid from headwords_fts where headwords_fts match ?').all(term)).toHaveLength(1);
    }
  });

  it('retracts the OLD term on update — the failure that returns rows which no longer exist', () => {
    const { headwordId } = seedEntry(db, { text: 'stol', norm: 'stol', gloss: 'table', lang: 'ru' });
    db.prepare('update headwords set text = ?, norm = ? where id = ?').run('стол', 'стол', headwordId);
    expect(db.prepare('select rowid from headwords_fts where headwords_fts match ?').all('stol')).toHaveLength(0);
    expect(db.prepare('select rowid from headwords_fts where headwords_fts match ?').all('стол')).toHaveLength(1);
  });

  it('drops a deleted headword out of the index', () => {
    const { headwordId } = seedEntry(db, { text: '食べる', gloss: 'to eat' });
    db.prepare('delete from headwords where id = ?').run(headwordId);
    expect(db.prepare('select rowid from headwords_fts where headwords_fts match ?').all('食べる')).toHaveLength(0);
  });

  it('indexes glosses independently of headwords, so EN→JA is the same query reversed', () => {
    seedEntry(db, { text: '食べる', gloss: 'to eat' });
    const byGloss = db
      .prepare(`
        select h.text as text from glosses_fts
        join glosses g on g.id = glosses_fts.rowid
        join senses  s on s.id = g.sense_id
        join headwords h on h.id = s.headword_id
        where glosses_fts match ?
      `)
      .all('eat') as { text: string }[];
    expect(byGloss.map((row) => row.text)).toEqual(['食べる']);
  });

  it('keeps the gloss index in step when a gloss is deleted', () => {
    const { glossId } = seedEntry(db, { text: '食べる', gloss: 'to eat' });
    db.prepare('delete from glosses where id = ?').run(glossId);
    expect(db.prepare('select rowid from glosses_fts where glosses_fts match ?').all('eat')).toHaveLength(0);
  });
});

describe('cascades — removing a dictionary must not orphan its rows', () => {
  it('deleting a dictionary removes headwords, senses, glosses and their index entries', () => {
    seedEntry(db, { dict: 'jmdict', text: '食べる', gloss: 'to eat' });
    seedEntry(db, { dict: 'cedict', text: '传统', norm: '传统', gloss: 'tradition', lang: 'zh' });

    db.prepare('delete from dictionaries where id = ?').run('jmdict');

    expect(db.prepare('select count(*) c from headwords').get()).toEqual({ c: 1 });
    expect(db.prepare('select count(*) c from senses').get()).toEqual({ c: 1 });
    expect(db.prepare('select count(*) c from glosses').get()).toEqual({ c: 1 });
    // The cascade fires the FTS triggers too — otherwise search keeps answering
    // with entries whose dictionary was removed.
    expect(db.prepare('select rowid from headwords_fts where headwords_fts match ?').all('食べる')).toHaveLength(0);
    expect(db.prepare('select rowid from headwords_fts where headwords_fts match ?').all('传统')).toHaveLength(1);
  });

  it('keeps user notes when the dictionary they annotate is removed', () => {
    const { headwordId } = seedEntry(db, { dict: 'jmdict', text: '食べる', gloss: 'to eat' });
    db.prepare('insert into user_notes (headword_id, note, updated_at) values (?, ?, ?)').run(headwordId, 'mine', 1);
    db.prepare('delete from dictionaries where id = ?').run('jmdict');
    expect(db.prepare('select count(*) c from user_notes').get()).toEqual({ c: 1 });
  });

  it('refuses a headword whose dictionary does not exist', () => {
    expect(() =>
      db.prepare('insert into headwords (dict_id, lang, text, norm) values (?, ?, ?, ?)').run('nope', 'ja', 'x', 'x'),
    ).toThrow(/FOREIGN KEY/i);
  });
});

describe('the claim Phase 1 rests on: lookup is an index hit, not a scan', () => {
  it('an exact headword lookup over 50k rows stays far under the 5 ms gate', () => {
    db.prepare('insert into dictionaries (id, title, source_lang, target_langs) values (?, ?, ?, ?)')
      .run('bulk', 'Bulk', 'ja', 'en');
    const insert = db.prepare('insert into headwords (dict_id, lang, text, norm) values (?, ?, ?, ?)');
    const fill = db.transaction(() => {
      for (let i = 0; i < 50_000; i += 1) insert.run('bulk', 'ja', `語${i}`, `語${i}`);
    });
    fill();

    const select = db.prepare('select id from headwords where lang = ? and norm = ?');
    const times: number[] = [];
    for (let i = 0; i < 500; i += 1) {
      const start = process.hrtime.bigint();
      select.get('ja', `語${(i * 97) % 50_000}`);
      times.push(Number(process.hrtime.bigint() - start) / 1e6);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)];
    expect(p95).toBeLessThan(5);

    // And prove it is the index doing it, not a fast scan on a small table:
    // a plan containing SCAN would still pass the timing assertion at this size.
    const plan = (db.prepare('explain query plan select id from headwords where lang = ? and norm = ?')
      .all('ja', '語1') as { detail: string }[])
      .map((row) => row.detail)
      .join(' ');
    // SQLite reports "USING COVERING INDEX" here — the stronger result, since the
    // query is answered from the index without touching the table at all. Accept
    // either, and fail on the thing that actually matters: a scan.
    expect(plan).toMatch(/USING (COVERING )?INDEX idx_hw_norm/);
    expect(plan).not.toMatch(/SCAN headwords(?! USING)/);
  });

  it('resolves a per-dictionary lookup on the pair, not by scanning one dictionary', () => {
    // The regression guard for a defect real data found and synthetic data hid.
    // With only idx_hw_dict(dict_id), SQLite matched dict_id and then walked every
    // row of that dictionary — ~100 ms per lookup against a 524k-entry JMdict. At
    // the 50k scale of the test above the scan is cheap, so timing alone would
    // never have failed; the query plan is what makes this detectable.
    const plan = (db.prepare('explain query plan select id from headwords where dict_id = ? and norm = ?')
      .all('bulk', 'x') as { detail: string }[])
      .map((row) => row.detail)
      .join(' ');
    expect(plan).toMatch(/idx_hw_dict_norm/);
    expect(plan).not.toMatch(/idx_hw_dict \(dict_id=\?\)/);
  });
});
