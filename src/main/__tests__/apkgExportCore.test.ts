// Applies a change set to a real SQLite collection and reads it back through
// the same reader an import would use — the round trip is the claim, so the
// test never trusts the UPDATE, only the re-read.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import type { Database, SqlJsStatic } from 'sql.js';
import { readRawCollection } from '../anki/apkgDraftRead';
import {
  applyExportChanges,
  verifyExportChanges,
  fieldChecksum,
  ExportRefusal,
} from '../anki/apkgExportCore';
import { ANKI_FIELD_SEP as SEP, splitNoteFields } from '../../shared/ankiDraft';
import { stripFieldHtml } from '../../shared/apkgParse';

const nodeRequire = createRequire(import.meta.url);
let SQL: SqlJsStatic;

beforeAll(async () => {
  const initSqlJs = nodeRequire('sql.js') as (config?: {
    wasmBinary?: Uint8Array;
  }) => Promise<SqlJsStatic>;
  SQL = await initSqlJs({
    wasmBinary: fs.readFileSync(nodeRequire.resolve('sql.js/dist/sql-wasm.wasm')),
  });
}, 30_000);

/** A legacy-schema collection: two notes, two cards, sortf = 1 on purpose so the
 *  sort-field write is distinguishable from the checksum's first-field read. */
function fixtureDb(): Database {
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE col (id integer primary key, crt integer, mod integer, scm integer,
      ver integer, dty integer, usn integer, ls integer, conf text, models text,
      decks text, dconf text, tags text);
    CREATE TABLE notes (id integer primary key, guid text, mid integer, mod integer,
      usn integer, tags text, flds text, sfld text, csum integer, flags integer, data text);
    CREATE TABLE cards (id integer primary key, nid integer, did integer, ord integer,
      mod integer, usn integer, type integer, queue integer, due integer, ivl integer,
      factor integer, reps integer, lapses integer, left integer, odue integer,
      odid integer, flags integer, data text);
  `);
  const models = {
    '100': {
      id: 100,
      name: 'Japanese',
      type: 0,
      css: '',
      sortf: 1,
      flds: [
        { name: 'Expression', ord: 0 },
        { name: 'Reading', ord: 1 },
      ],
      tmpls: [{ name: 'Card 1', ord: 0, qfmt: '{{Expression}}', afmt: '{{Reading}}' }],
    },
  };
  const decks = { '1': { id: 1, name: 'Default', dyn: 0, conf: 1 } };
  db.run('INSERT INTO col (id, crt, mod, ver, models, decks) VALUES (1, ?, ?, 11, ?, ?)', [
    1_500_000_000,
    1_600_000_000_000,
    JSON.stringify(models),
    JSON.stringify(decks),
  ]);
  db.run('INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [
    1001, 'guid-a', 100, 1_500_000_100, 0, ' core Marked ', ['食べる', 'たべる'].join(SEP), 'たべる', 0, 0, '',
  ]);
  db.run('INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [
    1002, 'guid-b', 100, 1_500_000_100, 0, '', ['猫', 'ねこ'].join(SEP), 'ねこ', 0, 0, '',
  ]);
  db.run('INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
    5001, 1001, 1, 0, 1_500_000_100, 0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0,
  ]);
  return db;
}

/**
 * Schema 18 keeps decks in their own table and separates ancestors with 0x1f,
 * so the deck writer has to be tested against both storages — a rename written
 * with `::` into this schema creates a deck literally called `A::B`.
 */
function normalizedDeckDb(): Database {
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE col (id integer primary key, crt integer, mod integer, ver integer,
      models text, decks text);
    CREATE TABLE notes (id integer primary key, guid text, mid integer, mod integer,
      usn integer, tags text, flds text, sfld text, csum integer, flags integer, data text);
    CREATE TABLE cards (id integer primary key, nid integer, did integer, ord integer,
      mod integer, usn integer, type integer, queue integer, due integer, ivl integer,
      factor integer, reps integer, lapses integer, left integer, odue integer,
      odid integer, flags integer, data text);
    CREATE TABLE decks (id integer primary key, name text, mtime_secs integer,
      usn integer, common blob, kind blob);
  `);
  db.run('INSERT INTO col (id, crt, mod, ver, models, decks) VALUES (1, ?, ?, 18, ?, ?)', [
    1_500_000_000,
    1_700_000_000_000,
    '',
    '',
  ]);
  db.run('INSERT INTO decks (id, name, mtime_secs, usn) VALUES (1, ?, 0, 0)', ['Japanese']);
  db.run('INSERT INTO decks (id, name, mtime_secs, usn) VALUES (2, ?, 0, 0)', ['jlpt\x1fn5']);
  db.run('INSERT INTO decks (id, name, mtime_secs, usn) VALUES (3, ?, 0, 0)', ['JLPT\x1fN5']);
  return db;
}

const NOW_MS = 1_700_000_000_500;

describe('applyExportChanges', () => {
  it('round-trips a field edit: flds, sfld, csum, mod and usn all move', () => {
    const db = fixtureDb();
    const result = applyExportChanges(
      db,
      { notes: [{ noteId: '1001', fields: ['<b>食べた</b>', 'たべた'] }], cardMoves: [] },
      { nowMs: NOW_MS, normalize: stripFieldHtml },
    );
    expect(result).toEqual({ notesUpdated: 1, cardsUpdated: 0, decksUpdated: 0 });

    const raw = readRawCollection(db);
    const noteRow = raw.notes.find((n) => String(n.id) === '1001')!;
    expect(splitNoteFields(noteRow.flds)).toEqual(['<b>食べた</b>', 'たべた']);
    expect(noteRow.mod).toBe(Math.floor(NOW_MS / 1000));

    const meta = db.exec('SELECT sfld, csum, usn, tags FROM notes WHERE id = 1001')[0]!.values[0]!;
    // sortf is 1, so the sort field is the Reading; csum reads field 0 stripped.
    expect(meta[0]).toBe('たべた');
    expect(meta[1]).toBe(fieldChecksum('食べた'));
    expect(meta[2]).toBe(-1);
    // Untouched note untouched.
    const other = db.exec('SELECT usn FROM notes WHERE id = 1002')[0]!.values[0]!;
    expect(other[0]).toBe(0);
    // col.mod moved to now (milliseconds).
    expect(db.exec('SELECT mod FROM col')[0]!.values[0]![0]).toBe(NOW_MS);
  });

  it('writes tags in Anki form and preserves the source marked token verbatim', () => {
    const db = fixtureDb();
    applyExportChanges(
      db,
      { notes: [{ noteId: '1001', tags: ['core', 'verbs'] }], cardMoves: [] },
      { nowMs: NOW_MS, normalize: stripFieldHtml },
    );
    const tags = db.exec('SELECT tags, flds FROM notes WHERE id = 1001')[0]!.values[0]!;
    expect(tags[0]).toBe(' core verbs Marked ');
    // A tags-only change never touches the fields.
    expect(tags[1]).toBe(['食べる', 'たべる'].join(SEP));
  });

  it('moves a card and marks it modified', () => {
    const db = fixtureDb();
    const result = applyExportChanges(
      db,
      { notes: [], cardMoves: [{ cardId: '5001', noteId: '1001', due: 3 }] },
      { nowMs: NOW_MS, normalize: stripFieldHtml },
    );
    expect(result).toEqual({ notesUpdated: 0, cardsUpdated: 1, decksUpdated: 0 });
    const row = db.exec('SELECT due, usn, mod FROM cards WHERE id = 5001')[0]!.values[0]!;
    expect(row).toEqual([3, -1, Math.floor(NOW_MS / 1000)]);
  });

  it('refuses before writing anything: a missing note leaves the db untouched', () => {
    const db = fixtureDb();
    expect(() =>
      applyExportChanges(
        db,
        {
          notes: [
            { noteId: '1001', fields: ['a', 'b'] },
            { noteId: '9999', fields: ['x', 'y'] },
          ],
          cardMoves: [],
        },
        { nowMs: NOW_MS, normalize: stripFieldHtml },
      ),
    ).toThrowError(ExportRefusal);
    // The valid first change must NOT have landed.
    const flds = db.exec('SELECT flds FROM notes WHERE id = 1001')[0]!.values[0]![0];
    expect(flds).toBe(['食べる', 'たべる'].join(SEP));
  });

  it('refuses a field-count mismatch by name', () => {
    const db = fixtureDb();
    try {
      applyExportChanges(
        db,
        { notes: [{ noteId: '1001', fields: ['only-one'] }], cardMoves: [] },
        { nowMs: NOW_MS, normalize: stripFieldHtml },
      );
      expect.unreachable('should have refused');
    } catch (err) {
      expect(err).toBeInstanceOf(ExportRefusal);
      expect((err as ExportRefusal).code).toBe('field-count-mismatch');
    }
  });

  it('refuses a missing card', () => {
    const db = fixtureDb();
    try {
      applyExportChanges(
        db,
        { notes: [], cardMoves: [{ cardId: '4444', noteId: '1001', due: 1 }] },
        { nowMs: NOW_MS, normalize: stripFieldHtml },
      );
      expect.unreachable('should have refused');
    } catch (err) {
      expect((err as ExportRefusal).code).toBe('card-missing');
    }
  });

  it('writes a deck rename into the legacy col.decks blob, keeping the rest of the entry', () => {
    const db = fixtureDb();
    const result = applyExportChanges(
      db,
      {
        notes: [],
        cardMoves: [],
        deckRenames: [{ deckId: '1', from: 'Default', to: 'Japanese::Core' }],
      },
      { nowMs: NOW_MS, normalize: stripFieldHtml },
    );
    expect(result).toEqual({ notesUpdated: 0, cardsUpdated: 0, decksUpdated: 1 });
    // Read back through the reader an import would use, not through the UPDATE.
    const decks = readRawCollection(db).decks;
    expect(decks).toEqual([{ id: '1', name: 'Japanese::Core', dyn: 0, conf: '1' }]);
    // The card did not move: a rename is a name, not a deck change.
    expect(db.exec('SELECT did FROM cards WHERE id = 5001')[0]!.values[0]![0]).toBe(1);
  });

  it('writes a deck rename into a schema-18 decks table', () => {
    const db = normalizedDeckDb();
    const result = applyExportChanges(
      db,
      {
        notes: [],
        cardMoves: [],
        deckRenames: [{ deckId: '2', from: 'jlpt\x1fn5', to: 'JLPT\x1fN4' }],
      },
      { nowMs: NOW_MS, normalize: stripFieldHtml },
    );
    expect(result.decksUpdated).toBe(1);
    const row = db.exec('SELECT name, usn, mtime_secs FROM decks WHERE id = 2')[0]!.values[0]!;
    expect(row).toEqual(['JLPT\x1fN4', -1, Math.floor(NOW_MS / 1000)]);
    // The deck that was not renamed is untouched.
    expect(db.exec('SELECT name FROM decks WHERE id = 1')[0]!.values[0]![0]).toBe('Japanese');
  });

  it('refuses a deck whose source name is not the one the rename was computed on', () => {
    const db = fixtureDb();
    try {
      applyExportChanges(
        db,
        { notes: [], cardMoves: [], deckRenames: [{ deckId: '1', from: 'Core', to: 'Japanese' }] },
        { nowMs: NOW_MS, normalize: stripFieldHtml },
      );
      expect.unreachable('should have refused');
    } catch (err) {
      expect((err as ExportRefusal).code).toBe('deck-changed');
    }
    expect(readRawCollection(db).decks[0].name).toBe('Default');
  });

  it('refuses a merge by name, and the legal rename beside it writes nothing either', () => {
    const db = normalizedDeckDb();
    try {
      applyExportChanges(
        db,
        {
          notes: [],
          cardMoves: [],
          deckRenames: [
            // Legal on its own…
            { deckId: '1', from: 'Japanese', to: 'Japanese\x1fCore' },
            // …and this one would land deck 2 on top of deck 3.
            { deckId: '2', from: 'jlpt\x1fn5', to: 'JLPT\x1fN5' },
          ],
        },
        { nowMs: NOW_MS, normalize: stripFieldHtml },
      );
      expect.unreachable('should have refused');
    } catch (err) {
      expect((err as ExportRefusal).code).toBe('deck-name-taken');
    }
    // All-or-nothing: the first rename was valid and must not have landed.
    expect(db.exec('SELECT name FROM decks WHERE id = 1')[0]!.values[0]![0]).toBe('Japanese');
    expect(db.exec('SELECT name FROM decks WHERE id = 2')[0]!.values[0]![0]).toBe('jlpt\x1fn5');
  });

  it('refuses a rename when the package declares the collation this build lacks', () => {
    // Real ver-18 packages declare `name text NOT NULL COLLATE unicase` and put a
    // UNIQUE index on it. sql.js cannot register that collation, so the UPDATE
    // fails with "no such collation sequence" — measured on the user's own
    // `N1 Vocab-20260102173058.apkg`. Refused before any write instead.
    // sql.js rejects the collation in a CREATE TABLE, which is why a real
    // package can only ever arrive with it already in the stored schema — so the
    // fixture puts it there the same way, through `writable_schema`.
    const db = normalizedDeckDb();
    db.run('PRAGMA writable_schema = ON');
    db.run(
      "UPDATE sqlite_master SET sql = replace(sql, 'name text', 'name text NOT NULL COLLATE unicase') WHERE type = 'table' AND name = 'decks'",
    );
    db.run('PRAGMA writable_schema = OFF');
    try {
      applyExportChanges(
        db,
        { notes: [], cardMoves: [], deckRenames: [{ deckId: '1', from: 'Japanese', to: 'japanese' }] },
        { nowMs: NOW_MS, normalize: stripFieldHtml },
      );
      expect.unreachable('should have refused');
    } catch (err) {
      expect((err as ExportRefusal).code).toBe('deck-collation-unsupported');
    }
    expect(db.exec('SELECT name FROM decks WHERE id = 1')[0]!.values[0]![0]).toBe('Japanese');

    // The control: the same collection without the collation writes normally, so
    // the refusal is keyed on the declaration and not on the schema being 18.
    const plain = normalizedDeckDb();
    expect(
      applyExportChanges(
        plain,
        { notes: [], cardMoves: [], deckRenames: [{ deckId: '2', from: 'jlptn5', to: 'JLPTN4' }] },
        { nowMs: NOW_MS, normalize: stripFieldHtml },
      ).decksUpdated,
    ).toBe(1);
  });

  it('refuses a deck that is not in the source package', () => {
    const db = fixtureDb();
    try {
      applyExportChanges(
        db,
        { notes: [], cardMoves: [], deckRenames: [{ deckId: '77', from: 'x', to: 'y' }] },
        { nowMs: NOW_MS, normalize: stripFieldHtml },
      );
      expect.unreachable('should have refused');
    } catch (err) {
      expect((err as ExportRefusal).code).toBe('deck-missing');
    }
  });
});

describe('verifyExportChanges', () => {
  it('confirms applied changes and catches a tampered one', () => {
    const db = fixtureDb();
    const changes = {
      notes: [{ noteId: '1001', fields: ['食べた', 'たべた'], tags: ['core'] }],
      cardMoves: [{ cardId: '5001', noteId: '1001', due: 7 }],
    };
    applyExportChanges(db, changes, { nowMs: NOW_MS, normalize: stripFieldHtml });
    expect(verifyExportChanges(db, changes)).toEqual({ ok: true, mismatches: [] });

    // The negative control: a collection that silently lost the field edit.
    db.run('UPDATE notes SET flds = ? WHERE id = 1001', [['食べる', 'たべる'].join(SEP)]);
    const verdict = verifyExportChanges(db, changes);
    expect(verdict.ok).toBe(false);
    expect(verdict.mismatches).toEqual(['note 1001: fields differ']);
  });

  it('confirms a deck rename and catches one that did not land', () => {
    const db = normalizedDeckDb();
    const changes = {
      notes: [],
      cardMoves: [],
      deckRenames: [{ deckId: '2', from: 'jlpt\x1fn5', to: 'JLPT\x1fN4' }],
    };
    applyExportChanges(db, changes, { nowMs: NOW_MS, normalize: stripFieldHtml });
    expect(verifyExportChanges(db, changes)).toEqual({ ok: true, mismatches: [] });

    // The negative control: a package whose deck row silently kept its old name.
    db.run('UPDATE decks SET name = ? WHERE id = 2', ['jlpt\x1fn5']);
    const verdict = verifyExportChanges(db, changes);
    expect(verdict.ok).toBe(false);
    expect(verdict.mismatches).toEqual(['deck 2: name differs']);
  });
});
