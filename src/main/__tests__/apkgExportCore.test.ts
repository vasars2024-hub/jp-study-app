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

const NOW_MS = 1_700_000_000_500;

describe('applyExportChanges', () => {
  it('round-trips a field edit: flds, sfld, csum, mod and usn all move', () => {
    const db = fixtureDb();
    const result = applyExportChanges(
      db,
      { notes: [{ noteId: '1001', fields: ['<b>食べた</b>', 'たべた'] }], cardMoves: [] },
      { nowMs: NOW_MS, normalize: stripFieldHtml },
    );
    expect(result).toEqual({ notesUpdated: 1, cardsUpdated: 0 });

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
    expect(result).toEqual({ notesUpdated: 0, cardsUpdated: 1 });
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
});
