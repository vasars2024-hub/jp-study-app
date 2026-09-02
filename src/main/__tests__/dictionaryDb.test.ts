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

  it('backfills provenance for app-owned legacy sources without overwriting user metadata', () => {
    db.prepare(`
      insert into dictionaries (id, title, source_lang, target_langs, licence, attribution)
      values (?, ?, 'ja', 'en', ?, ?)
    `).run('bundled-jmdict-en', 'JMdict', null, null);
    db.prepare(`
      insert into dictionaries (id, title, source_lang, target_langs, licence, attribution)
      values (?, ?, 'ja', 'en', ?, ?)
    `).run('bundled-moedict-zh', 'Moedict', 'Custom licence', 'Custom attribution');
    db.prepare(`
      insert into dictionaries (id, title, source_lang, target_langs, licence, attribution)
      values (?, ?, 'ja', 'en', ?, ?)
    `).run('user-jmdict-copy', 'JMdict copy', null, null);

    // Wind back to just before migration 3, the one under test. The rewind is
    // artificial, so every table a later step creates has to go with it —
    // otherwise that step re-runs against its own output and throws.
    db.exec('drop table if exists dict_pair_priority');
    db.pragma('user_version = 2');
    expect(migrateDictionaryDb(db)).toBe(DICT_SCHEMA_VERSION);

    expect(db.prepare('select licence, attribution from dictionaries where id = ?').get('bundled-jmdict-en')).toEqual({
      licence: 'CC BY-SA 4.0',
      attribution: 'JMdict — Electronic Dictionary Research and Development Group (EDRDG) — https://www.edrdg.org/jmdict/j_jmdict.html',
    });
    expect(db.prepare('select licence, attribution from dictionaries where id = ?').get('bundled-moedict-zh')).toEqual({
      licence: 'Custom licence',
      attribution: 'Custom attribution',
    });
    expect(db.prepare('select licence, attribution from dictionaries where id = ?').get('user-jmdict-copy')).toEqual({
      licence: null,
      attribution: null,
    });
  });

  it('repairs the zero entry_count of pitch and frequency stores already migrated', () => {
    const declare = db.prepare(`
      insert into dictionaries (id, title, source_lang, target_langs, kind, entry_count)
      values (?, ?, 'ja', 'ja', ?, ?)
    `);
    declare.run('bundled-kanjium-pitch', 'Kanjium', 'pitch', 0);
    declare.run('freq-narou', 'Narou', 'freq', 0);
    declare.run('freq-counted', 'Already counted', 'freq', 7);
    declare.run('freq-empty', 'Genuinely empty', 'freq', 0);
    declare.run('bundled-jmdict-en', 'JMdict', 'term', 0);

    const pitch = db.prepare('insert into pitch (dict_id, lang, norm, reading, positions) values (?, ?, ?, ?, ?)');
    for (const norm of ['橋', '箸', '端']) pitch.run('bundled-kanjium-pitch', 'ja', norm, 'はし', '1');
    const freq = db.prepare('insert into freq_corpora (lang, norm, corpus, rank) values (?, ?, ?, ?)');
    freq.run('ja', '食べる', 'freq-narou', 42);
    freq.run('ja', '走る', 'freq-narou', 517);
    // A number some other path set on purpose must survive, so this store's two
    // rows must not overwrite its declared 7.
    freq.run('ja', '見る', 'freq-counted', 3);

    db.pragma('user_version = 8');
    expect(migrateDictionaryDb(db)).toBe(DICT_SCHEMA_VERSION);

    const counted = Object.fromEntries(
      (db.prepare('select id, entry_count from dictionaries').all() as { id: string; entry_count: number }[])
        .map((row) => [row.id, row.entry_count]),
    );
    expect(counted).toEqual({
      'bundled-kanjium-pitch': 3,
      'freq-narou': 2,
      'freq-counted': 7,
      'freq-empty': 0,
      // A term store with no headwords is honestly empty; the step must not
      // reach for another kind's rows to make it look populated.
      'bundled-jmdict-en': 0,
    });

    // Idempotent: the guard is `entry_count = 0`, so a second pass changes nothing.
    db.pragma('user_version = 8');
    migrateDictionaryDb(db);
    expect(db.prepare('select entry_count c from dictionaries where id = ?').get('bundled-kanjium-pitch'))
      .toEqual({ c: 3 });
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

// Boss audit 2026-09-02, Finding 5. `readonly: true` used to mean only "skip the
// migration ladder": the handle was opened with the driver's default read-write
// flags, so the read worker's stated invariant ("this role must never change the
// file") was enforced by nothing but the dispatch table happening to expose reads.
// These assert the flag against the ENGINE, which is the only thing that can hold
// it once an eighth dispatch entry is added.
describe('readonly — the flag the read worker’s invariant rests on', () => {
  it('refuses a write, and it is SQLite refusing rather than a convention', () => {
    seedEntry(db, { text: '食べる', gloss: 'to eat' });
    db.close();

    const ro = openDictionaryDb({ dir, readonly: true });
    try {
      // Reads still work — a handle that refused these would be useless, and the
      // refusal below would prove nothing about writes.
      expect(ro.prepare('select count(*) c from headwords').get()).toEqual({ c: 1 });
      expect(
        ro.prepare('select rowid from headwords_fts where headwords_fts match ?').all('食べる'),
      ).toHaveLength(1);

      expect(() =>
        ro.prepare('insert into headwords (dict_id, lang, text, norm) values (?, ?, ?, ?)')
          .run('d1', 'ja', '飲む', '飲む'),
      ).toThrow(/readonly/i);
      expect(() => ro.exec('drop table headwords')).toThrow(/readonly/i);
    } finally {
      ro.close();
    }

    // NEGATIVE CONTROL. The same two statements on a normal handle must SUCCEED,
    // or the assertions above are satisfied by something other than the flag —
    // a missing table or a malformed statement would throw here too.
    const rw = openDictionaryDb({ dir });
    try {
      expect(() =>
        rw.prepare('insert into headwords (dict_id, lang, text, norm) values (?, ?, ?, ?)')
          .run('d1', 'ja', '飲む', '飲む'),
      ).not.toThrow();
      expect(() => rw.exec('drop table headwords')).not.toThrow();
    } finally {
      rw.close();
    }
  });

  it('does not stamp the file header — no journal_mode write from a reader', () => {
    // `journal_mode = WAL` REWRITES the header. It ran on every readonly open, on
    // a file the caller promised not to touch. Delete the WAL sidecars, reopen the
    // file in rollback mode, and a readonly open must leave it in rollback mode.
    db.pragma('journal_mode = DELETE');
    expect(db.pragma('journal_mode', { simple: true })).toBe('delete');
    db.close();

    const ro = openDictionaryDb({ dir, readonly: true });
    try {
      expect(ro.pragma('journal_mode', { simple: true })).toBe('delete');
    } finally {
      ro.close();
    }

    // NEGATIVE CONTROL: the read-write open on the very same file DOES convert it,
    // so "still delete" above is this flag's doing and not an inert pragma call.
    const rw = openDictionaryDb({ dir });
    try {
      expect(rw.pragma('journal_mode', { simple: true })).toBe('wal');
    } finally {
      rw.close();
    }
  });

  it('still skips the migration ladder, which is what it originally promised', () => {
    // Its own file: winding `user_version` back on the shared one would make the
    // next read-write open re-run migration 1 against tables that already exist,
    // which is a throw (see 'reports the failing step…' above), not a fixture.
    const own = path.join(tempRoot, 'ladder');
    const seeded = openDictionaryDb({ dir: own });
    expect(Number(seeded.pragma('user_version', { simple: true }))).toBe(DICT_SCHEMA_VERSION);
    seeded.pragma('user_version = 0');
    seeded.close();

    const ro = openDictionaryDb({ dir: own, readonly: true });
    try {
      expect(Number(ro.pragma('user_version', { simple: true }))).toBe(0);
    } finally {
      ro.close();
    }
  });
});

// The other half of Finding 5's repair. `readonly` carried TWO meanings, and making
// the first one real broke the only caller that wanted just the second: the schema-6
// suite's `openV5()`, which drives `MIGRATIONS` by hand to build a v5 file and then
// stamps `user_version` itself. It failed with `unable to open database file`,
// because SQLITE_OPEN_READONLY does not create one.
describe('skipMigrations — an old-schema file a test still has to write', () => {
  it('creates the file and leaves it unmigrated, while staying writable', () => {
    const own = path.join(tempRoot, 'skip');
    const handle = openDictionaryDb({ dir: own, skipMigrations: true });
    try {
      // Created, not refused: this is the exact failure the flag exists to avoid.
      expect(fs.existsSync(path.join(own, 'dict.db'))).toBe(true);
      expect(Number(handle.pragma('user_version', { simple: true }))).toBe(0);
      // …and writable, which is the whole difference from `readonly`. A readonly
      // handle throws on both of these (see the describe above).
      expect(() => handle.exec('create table probe (id integer primary key)')).not.toThrow();
      expect(() => handle.prepare('insert into probe (id) values (1)').run()).not.toThrow();
      expect(handle.prepare('select count(*) c from probe').get()).toEqual({ c: 1 });
    } finally {
      handle.close();
    }
  });

  it('NEGATIVE CONTROL: the same directory without the flag DOES migrate', () => {
    // Without this, "user_version is 0" above could just mean the ladder is broken
    // or the directory is somewhere nothing ever runs.
    const own = path.join(tempRoot, 'skip-control');
    const skipped = openDictionaryDb({ dir: own, skipMigrations: true });
    expect(Number(skipped.pragma('user_version', { simple: true }))).toBe(0);
    skipped.close();

    const migrated = openDictionaryDb({ dir: own });
    try {
      expect(Number(migrated.pragma('user_version', { simple: true }))).toBe(DICT_SCHEMA_VERSION);
    } finally {
      migrated.close();
    }
  });

  it('readonly still implies it, so the two flags cannot disagree', () => {
    const own = path.join(tempRoot, 'skip-implied');
    const seeded = openDictionaryDb({ dir: own });
    seeded.pragma('user_version = 0');
    seeded.close();

    const ro = openDictionaryDb({ dir: own, readonly: true, skipMigrations: false });
    try {
      expect(Number(ro.pragma('user_version', { simple: true }))).toBe(0);
    } finally {
      ro.close();
    }
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

  // Surviving the cascade was only ever half of it. A row that outlives its
  // headword and still points at that headword's id is worse than a deleted one,
  // because the next import hands the id to a different word — which is what
  // migration 6 gave the table an identity to prevent. The row count alone
  // asserted the harmless half, so it asserts the identity too now.
  it('keeps user notes, and the word they name, when their dictionary is removed', () => {
    seedEntry(db, { dict: 'jmdict', text: '食べる', gloss: 'to eat' });
    db.prepare(`
      insert into user_notes (headword_id, lang, text, norm, reading, reading_norm, note, updated_at)
      values (0, 'ja', '食べる', '食べる', '', '', ?, 1)
    `).run('mine');
    db.prepare('delete from dictionaries where id = ?').run('jmdict');
    expect(db.prepare('select count(*) c from headwords').get()).toEqual({ c: 0 });
    expect(db.prepare('select lang, text, note from user_notes').all()).toEqual([
      { lang: 'ja', text: '食べる', note: 'mine' },
    ]);
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

  it('reads a sense’s glosses from an index, not by scanning every gloss', () => {
    // The worst of the two index defects real data found, because this query runs
    // for every entry of every lookup: `where sense_id = ?` cannot use
    // idx_gloss_lang(lang, sense_id) — wrong leading column — so SQLite scanned
    // all 1.33 M glosses, 95 ms a call.
    const plan = (db.prepare('explain query plan select text from glosses where sense_id = ? order by ord, id')
      .all(1) as { detail: string }[])
      .map((row) => row.detail)
      .join(' ');
    expect(plan).toMatch(/idx_gloss_sense/);
    expect(plan).not.toMatch(/SCAN glosses/);
  });

  it('reads a headword’s senses from an index', () => {
    const plan = (db.prepare('explain query plan select id from senses where headword_id = ? order by ord, id')
      .all(1) as { detail: string }[])
      .map((row) => row.detail)
      .join(' ');
    expect(plan).toMatch(/idx_sense_hw/);
    expect(plan).not.toMatch(/SCAN senses/);
  });
});
