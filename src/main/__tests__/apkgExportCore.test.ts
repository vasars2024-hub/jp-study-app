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
import type { AnkiDraft } from '../../shared/ankiDraft';
import { ANKI_FIELD_SEP as SEP, buildAnkiDraft, splitNoteFields } from '../../shared/ankiDraft';
import { planChangeTray } from '../../shared/ankiChangeTray';
import { createEditJournal } from '../../shared/ankiDraftEdit';
import { buildApkgExportChanges, exportChangesEmpty } from '../../shared/ankiApkgExport';
import type { ApkgExportChangeSet, ApkgExportTemplateAdd } from '../../shared/ankiApkgExport';
import { decodeTemplateConfig } from '../anki/ankiProtoConfig';
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
    expect(result).toEqual({ notesUpdated: 1, cardsUpdated: 0, decksUpdated: 0, templatesRemoved: 0, templatesAdded: 0, templatesFormatted: 0, cardsCreated: 0, cardsDeleted: 0 });

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
    expect(result).toEqual({ notesUpdated: 0, cardsUpdated: 1, decksUpdated: 0, templatesRemoved: 0, templatesAdded: 0, templatesFormatted: 0, cardsCreated: 0, cardsDeleted: 0 });
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
    expect(result).toEqual({ notesUpdated: 0, cardsUpdated: 0, decksUpdated: 1, templatesRemoved: 0, templatesAdded: 0, templatesFormatted: 0, cardsCreated: 0, cardsDeleted: 0 });
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

// ----- recipe 13's split: create the deck row, then write cards.did ---------------

describe('applyExportChanges — recipe 13 deck moves', () => {
  const splitChanges = {
    notes: [],
    cardMoves: [],
    deckRenames: [],
    cardDeckMoves: [{ cardId: '5001', noteId: '1001', deckId: 'split:1:N5' }],
    deckCreates: [{ deckId: 'split:1:N5', name: 'Default::N5', configId: '1' }],
  };

  it('creates the legacy blob entry and refiles the card into its real id', () => {
    const db = fixtureDb();
    const result = applyExportChanges(db, splitChanges, {
      nowMs: NOW_MS,
      normalize: stripFieldHtml,
    });
    expect(result).toEqual({ notesUpdated: 0, cardsUpdated: 1, decksUpdated: 1, templatesRemoved: 0, templatesAdded: 0, templatesFormatted: 0, cardsCreated: 0, cardsDeleted: 0 });

    // Read back through the reader an import would use, not through the INSERT.
    const decks = readRawCollection(db).decks;
    expect(decks.map((d) => d.name).sort()).toEqual(['Default', 'Default::N5']);
    const created = decks.find((d) => d.name === 'Default::N5')!;
    // Allocated from nowMs, like Anki's own creation-timestamp ids — and never 0.
    expect(created.id).toBe(String(NOW_MS));
    expect(created.dyn).toBe(0);
    expect(created.conf).toBe('1');

    const card = db.exec('SELECT did, usn, mod FROM cards WHERE id = 5001')[0]!.values[0]!;
    expect(card).toEqual([NOW_MS, -1, Math.floor(NOW_MS / 1000)]);
    // The counters a brand-new deck must carry, or older Anki throws on open.
    const blob = JSON.parse(
      String(db.exec('SELECT decks FROM col')[0]!.values[0]![0]),
    ) as Record<string, Record<string, unknown>>;
    expect(blob[String(NOW_MS)].newToday).toEqual([0, 0]);
    expect(blob[String(NOW_MS)].desc).toBe('');
  });

  it('creates a schema-18 decks row whose kind blob reads back as a normal deck', () => {
    const db = normalizedDeckDb();
    db.run('INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [
      1001, 'guid-a', 100, 1_500_000_100, 0, '', ['食べる', 'たべる'].join(SEP), 'たべる', 0, 0, '',
    ]);
    db.run('INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
      5001, 1001, 1, 0, 1_500_000_100, 0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    const changes = {
      notes: [],
      cardMoves: [],
      deckRenames: [],
      cardDeckMoves: [{ cardId: '5001', noteId: '1001', deckId: 'split:1:N5' }],
      // Schema 18 nests on 0x1f, and the planner hands the name over in the
      // source's own separator — so this is what a real split would send.
      deckCreates: [{ deckId: 'split:1:N5', name: 'Japanese\x1fN5', configId: '1' }],
    };
    expect(applyExportChanges(db, changes, { nowMs: NOW_MS, normalize: stripFieldHtml })).toEqual({
      notesUpdated: 0,
      cardsUpdated: 1,
      decksUpdated: 1,
      templatesRemoved: 0,
      templatesAdded: 0, templatesFormatted: 0, cardsCreated: 0, cardsDeleted: 0,
    });
    // `dyn: 0` here is the reader deciding from the kind blob's first byte, so it
    // is a real assertion about the bytes written and not about the column.
    const created = readRawCollection(db).decks.find((d) => d.name === 'Japanese\x1fN5')!;
    expect(created).toEqual({ id: String(NOW_MS), name: 'Japanese\x1fN5', dyn: 0 });
    // Normal(config_id = 1), length-delimited under field 1.
    const kind = db.exec('SELECT kind FROM decks WHERE id = ?', [NOW_MS])[0]!.values[0]![0];
    expect(Array.from(kind as Uint8Array)).toEqual([0x0a, 0x02, 0x08, 0x01]);
    expect(db.exec('SELECT did FROM cards WHERE id = 5001')[0]!.values[0]![0]).toBe(NOW_MS);
  });

  it('allocates distinct ids for several new decks and skips ones the source holds', () => {
    const db = fixtureDb();
    db.run('INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
      5002, 1002, 1, 0, 1_500_000_100, 0, 0, 0, 11, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    // A deck already sitting on the first id this run would allocate.
    const blob0 = JSON.parse(String(db.exec('SELECT decks FROM col')[0]!.values[0]![0])) as Record<
      string,
      unknown
    >;
    blob0[String(NOW_MS)] = { id: NOW_MS, name: 'Occupied', dyn: 0, conf: 1 };
    db.run('UPDATE col SET decks = ?', [JSON.stringify(blob0)]);

    const result = applyExportChanges(
      db,
      {
        notes: [],
        cardMoves: [],
        deckRenames: [],
        cardDeckMoves: [
          { cardId: '5001', noteId: '1001', deckId: 'split:1:N5' },
          { cardId: '5002', noteId: '1002', deckId: 'split:1:N4' },
        ],
        deckCreates: [
          { deckId: 'split:1:N5', name: 'Default::N5', configId: '1' },
          { deckId: 'split:1:N4', name: 'Default::N4', configId: '1' },
        ],
      },
      { nowMs: NOW_MS, normalize: stripFieldHtml },
    );
    expect(result).toEqual({ notesUpdated: 0, cardsUpdated: 2, decksUpdated: 2, templatesRemoved: 0, templatesAdded: 0, templatesFormatted: 0, cardsCreated: 0, cardsDeleted: 0 });
    const decks = readRawCollection(db).decks;
    const n5 = decks.find((d) => d.name === 'Default::N5')!;
    const n4 = decks.find((d) => d.name === 'Default::N4')!;
    expect(n5.id).toBe(String(NOW_MS + 1));
    expect(n4.id).toBe(String(NOW_MS + 2));
    expect(db.exec('SELECT did FROM cards WHERE id = 5001')[0]!.values[0]![0]).toBe(NOW_MS + 1);
    expect(db.exec('SELECT did FROM cards WHERE id = 5002')[0]!.values[0]![0]).toBe(NOW_MS + 2);
    // The occupied deck kept its id and name.
    expect(decks.find((d) => d.id === String(NOW_MS))!.name).toBe('Occupied');
  });

  it('refiles into a deck the source already has without creating anything', () => {
    const db = normalizedDeckDb();
    db.run('INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
      5001, 1001, 1, 0, 1_500_000_100, 0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    const before = db.exec('SELECT count(*) FROM decks')[0]!.values[0]![0];
    const result = applyExportChanges(
      db,
      {
        notes: [],
        cardMoves: [],
        deckRenames: [],
        cardDeckMoves: [{ cardId: '5001', noteId: '1001', deckId: '3' }],
      },
      { nowMs: NOW_MS, normalize: stripFieldHtml },
    );
    expect(result).toEqual({ notesUpdated: 0, cardsUpdated: 1, decksUpdated: 0, templatesRemoved: 0, templatesAdded: 0, templatesFormatted: 0, cardsCreated: 0, cardsDeleted: 0 });
    expect(db.exec('SELECT count(*) FROM decks')[0]!.values[0]![0]).toBe(before);
    expect(db.exec('SELECT did FROM cards WHERE id = 5001')[0]!.values[0]![0]).toBe(3);
  });

  it('refuses a target deck the source lacks and the change set does not describe', () => {
    const db = fixtureDb();
    try {
      applyExportChanges(
        db,
        {
          notes: [],
          cardMoves: [],
          deckRenames: [],
          cardDeckMoves: [{ cardId: '5001', noteId: '1001', deckId: 'split:1:N5' }],
        },
        { nowMs: NOW_MS, normalize: stripFieldHtml },
      );
      expect.unreachable('should have refused');
    } catch (err) {
      expect((err as ExportRefusal).code).toBe('deck-missing');
    }
    // All-or-nothing: no deck appeared and the card did not move.
    expect(readRawCollection(db).decks).toHaveLength(1);
    expect(db.exec('SELECT did FROM cards WHERE id = 5001')[0]!.values[0]![0]).toBe(1);
  });

  it('refuses creating a deck whose name the source already holds', () => {
    const db = fixtureDb();
    try {
      applyExportChanges(
        db,
        {
          notes: [],
          cardMoves: [],
          deckRenames: [],
          cardDeckMoves: [{ cardId: '5001', noteId: '1001', deckId: 'split:1:x' }],
          deckCreates: [{ deckId: 'split:1:x', name: 'Default', configId: '1' }],
        },
        { nowMs: NOW_MS, normalize: stripFieldHtml },
      );
      expect.unreachable('should have refused');
    } catch (err) {
      expect((err as ExportRefusal).code).toBe('deck-name-taken');
    }
    expect(readRawCollection(db).decks).toHaveLength(1);
  });

  it('lets a create take a name a rename in the same batch just freed', () => {
    const db = fixtureDb();
    const result = applyExportChanges(
      db,
      {
        notes: [],
        cardMoves: [],
        deckRenames: [{ deckId: '1', from: 'Default', to: 'Archive' }],
        cardDeckMoves: [{ cardId: '5001', noteId: '1001', deckId: 'split:1:x' }],
        deckCreates: [{ deckId: 'split:1:x', name: 'Default', configId: '1' }],
      },
      { nowMs: NOW_MS, normalize: stripFieldHtml },
    );
    expect(result.decksUpdated).toBe(2);
    const names = readRawCollection(db).decks.map((d) => d.name).sort();
    expect(names).toEqual(['Archive', 'Default']);
  });

  it('refuses a card on loan to a filtered deck by name', () => {
    const db = fixtureDb();
    db.run('UPDATE cards SET odid = 9, odue = 4 WHERE id = 5001');
    try {
      applyExportChanges(db, splitChanges, { nowMs: NOW_MS, normalize: stripFieldHtml });
      expect.unreachable('should have refused');
    } catch (err) {
      expect((err as ExportRefusal).code).toBe('card-filtered');
    }
    expect(db.exec('SELECT did FROM cards WHERE id = 5001')[0]!.values[0]![0]).toBe(1);
    expect(readRawCollection(db).decks).toHaveLength(1);
  });

  it('refuses a missing card before creating the deck it would have moved to', () => {
    const db = fixtureDb();
    try {
      applyExportChanges(
        db,
        {
          notes: [],
          cardMoves: [],
          deckRenames: [],
          cardDeckMoves: [{ cardId: '4444', noteId: '1001', deckId: 'split:1:N5' }],
          deckCreates: [{ deckId: 'split:1:N5', name: 'Default::N5', configId: '1' }],
        },
        { nowMs: NOW_MS, normalize: stripFieldHtml },
      );
      expect.unreachable('should have refused');
    } catch (err) {
      expect((err as ExportRefusal).code).toBe('card-missing');
    }
    expect(readRawCollection(db).decks).toHaveLength(1);
  });

  it('counts a card that is both repositioned and refiled once', () => {
    const db = fixtureDb();
    const result = applyExportChanges(
      db,
      {
        notes: [],
        cardMoves: [{ cardId: '5001', noteId: '1001', due: 42 }],
        deckRenames: [],
        cardDeckMoves: [{ cardId: '5001', noteId: '1001', deckId: 'split:1:N5' }],
        deckCreates: [{ deckId: 'split:1:N5', name: 'Default::N5', configId: '1' }],
      },
      { nowMs: NOW_MS, normalize: stripFieldHtml },
    );
    expect(result.cardsUpdated).toBe(1);
    const row = db.exec('SELECT due, did FROM cards WHERE id = 5001')[0]!.values[0]!;
    expect(row).toEqual([42, NOW_MS]);
  });

  it('refuses a split into a package that declares the collation this build lacks', () => {
    const db = normalizedDeckDb();
    db.run('INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
      5001, 1001, 1, 0, 1_500_000_100, 0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    db.run('PRAGMA writable_schema = ON');
    db.run(
      "UPDATE sqlite_master SET sql = replace(sql, 'name text', 'name text NOT NULL COLLATE unicase') WHERE type = 'table' AND name = 'decks'",
    );
    db.run('PRAGMA writable_schema = OFF');
    try {
      applyExportChanges(
        db,
        {
          notes: [],
          cardMoves: [],
          deckRenames: [],
          cardDeckMoves: [{ cardId: '5001', noteId: '1001', deckId: 'split:1:N5' }],
          deckCreates: [{ deckId: 'split:1:N5', name: 'Japanese\x1fN5', configId: '1' }],
        },
        { nowMs: NOW_MS, normalize: stripFieldHtml },
      );
      expect.unreachable('should have refused');
    } catch (err) {
      expect((err as ExportRefusal).code).toBe('deck-collation-unsupported');
    }
    // The control that keeps this refusal scoped: the SAME package refiles into a
    // deck it already has, because that write never touches `decks.name`.
    expect(
      applyExportChanges(
        db,
        {
          notes: [],
          cardMoves: [],
          deckRenames: [],
          cardDeckMoves: [{ cardId: '5001', noteId: '1001', deckId: '3' }],
        },
        { nowMs: NOW_MS, normalize: stripFieldHtml },
      ),
    ).toEqual({ notesUpdated: 0, cardsUpdated: 1, decksUpdated: 0, templatesRemoved: 0, templatesAdded: 0, templatesFormatted: 0, cardsCreated: 0, cardsDeleted: 0 });
    expect(db.exec('SELECT did FROM cards WHERE id = 5001')[0]!.values[0]![0]).toBe(3);
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

  it('confirms a split by resolving the minted deck id back through its NAME', () => {
    const db = fixtureDb();
    const changes = {
      notes: [],
      cardMoves: [],
      deckRenames: [],
      cardDeckMoves: [{ cardId: '5001', noteId: '1001', deckId: 'split:1:N5' }],
      deckCreates: [{ deckId: 'split:1:N5', name: 'Default::N5', configId: '1' }],
    };
    applyExportChanges(db, changes, { nowMs: NOW_MS, normalize: stripFieldHtml });
    expect(verifyExportChanges(db, changes)).toEqual({ ok: true, mismatches: [] });

    // Negative control 1: the card silently stayed where it was.
    db.run('UPDATE cards SET did = 1 WHERE id = 5001');
    expect(verifyExportChanges(db, changes)).toEqual({
      ok: false,
      mismatches: ['card 5001: deck differs'],
    });

    // Negative control 2: the deck row itself never landed, so there is no id to
    // compare against at all — a different mismatch from the one above.
    const db2 = fixtureDb();
    applyExportChanges(db2, changes, { nowMs: NOW_MS, normalize: stripFieldHtml });
    const blob = JSON.parse(String(db2.exec('SELECT decks FROM col')[0]!.values[0]![0])) as Record<
      string,
      unknown
    >;
    delete blob[String(NOW_MS)];
    db2.run('UPDATE col SET decks = ?', [JSON.stringify(blob)]);
    expect(verifyExportChanges(db2, changes)).toEqual({
      ok: false,
      mismatches: ['deck split:1:N5: missing'],
    });
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

// ----- recipe 17's remove half -------------------------------------------------

/** Legacy `col.models`, one note type with THREE templates and cards at 0/1/2. */
function threeTemplateDb(): Database {
  const db = fixtureDb();
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
      tmpls: [
        { name: 'Card 1', ord: 0, qfmt: '{{Expression}}', afmt: '{{Reading}}' },
        { name: 'Card 1 copy', ord: 1, qfmt: '{{Expression}}', afmt: '{{Reading}}' },
        { name: 'Card 2', ord: 2, qfmt: '{{Reading}}', afmt: '{{Expression}}' },
      ],
    },
  };
  db.run('UPDATE col SET models = ?', [JSON.stringify(models)]);
  db.run('DELETE FROM cards');
  let cardId = 5001;
  for (const nid of [1001, 1002]) {
    for (const ord of [0, 1, 2]) {
      db.run(
        'INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [cardId++, nid, 1, ord, 1_500_000_100, 0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0],
      );
    }
  }
  return db;
}

/** Schema 18: the template list is its own table, so `ord` is a plain column. */
function normalizedTemplateDb(): Database {
  const db = normalizedDeckDb();
  db.run(`
    CREATE TABLE notetypes (id integer primary key, name text, mtime_secs integer,
      usn integer, config blob);
    CREATE TABLE templates (ntid integer, ord integer, name text, mtime_secs integer,
      usn integer, config blob);
  `);
  db.run('INSERT INTO notetypes (id, name, mtime_secs, usn, config) VALUES (100, ?, 0, 0, ?)', [
    'Japanese',
    new Uint8Array(0),
  ]);
  const rows: Array<[number, string]> = [
    [0, 'Card 1'],
    [1, 'Card 1 copy'],
    [2, 'Card 2'],
  ];
  for (const [ord, name] of rows) {
    db.run(
      'INSERT INTO templates (ntid, ord, name, mtime_secs, usn, config) VALUES (100, ?, ?, 0, 0, ?)',
      [ord, name, new Uint8Array(0)],
    );
  }
  db.run(
    'INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    [1001, 'guid-a', 100, 1_500_000_100, 0, '', ['食べる', 'たべる'].join(SEP), 'たべる', 0, 0, ''],
  );
  let cardId = 5001;
  for (const ord of [0, 1, 2]) {
    db.run(
      'INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [cardId++, 1001, 1, ord, 1_500_000_100, 0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0],
    );
  }
  return db;
}

function removeOnly(removedOrds: number[], noteTypeId = '100') {
  return { notes: [], cardMoves: [], deckRenames: [], templateRemovals: [{ noteTypeId, removedOrds }] };
}

/** Card ords still in the collection, ascending — the number every claim here cites. */
function cardOrds(db: Database): number[] {
  const values = db.exec('SELECT ord FROM cards ORDER BY nid, ord')[0]?.values ?? [];
  return values.map((row) => Number(row[0]));
}

function cardCount(db: Database): number {
  return Number(db.exec('SELECT COUNT(*) FROM cards')[0]?.values?.[0]?.[0] ?? -1);
}

describe('applyExportChanges — recipe 17 template removal (legacy col.models)', () => {
  it('drops the template, deletes its cards and renumbers both halves', () => {
    const db = threeTemplateDb();
    const result = applyExportChanges(db, removeOnly([1]), {
      nowMs: NOW_MS,
      normalize: stripFieldHtml,
    });
    expect(result.templatesRemoved).toBe(1);
    expect(result.cardsDeleted).toBe(2);

    // Read back through the importer's own reader, never the UPDATE.
    const model = readRawCollection(db).noteTypes.find((nt) => String(nt.id) === '100');
    expect(model?.templates.map((t) => [t.ord, t.name])).toEqual([
      [0, 'Card 1'],
      [1, 'Card 2'],
    ]);
    // Card 2's cards followed their template from ord 2 down to ord 1.
    expect(cardOrds(db)).toEqual([0, 1, 0, 1]);
    expect(cardCount(db)).toBe(4);
  });

  it('NEGATIVE CONTROL: undoing the card renumbering is what produces orphans', () => {
    const db = threeTemplateDb();
    applyExportChanges(db, removeOnly([1]), { nowMs: NOW_MS, normalize: stripFieldHtml });
    const model = readRawCollection(db).noteTypes.find((nt) => String(nt.id) === '100');
    const present = new Set((model?.templates ?? []).map((t) => t.ord));
    expect(cardOrds(db).filter((ord) => !present.has(ord))).toEqual([]);

    // The same collection with the card renumbering undone — what a removal that
    // only rewrote `col.models` would leave behind.
    db.run('UPDATE cards SET ord = 2 WHERE ord = 1');
    expect(cardOrds(db).filter((ord) => !present.has(ord))).toHaveLength(2);
  });

  it('removes two templates in one pass without colliding their ords', () => {
    const db = threeTemplateDb();
    const result = applyExportChanges(db, removeOnly([0, 1]), {
      nowMs: NOW_MS,
      normalize: stripFieldHtml,
    });
    expect(result.templatesRemoved).toBe(2);
    expect(result.cardsDeleted).toBe(4);
    const model = readRawCollection(db).noteTypes.find((nt) => String(nt.id) === '100');
    expect(model?.templates.map((t) => [t.ord, t.name])).toEqual([[0, 'Card 2']]);
    expect(cardOrds(db)).toEqual([0, 0]);
  });

  it('refuses a missing note type, a missing ord, and emptying a note type', () => {
    const cases: Array<[ReturnType<typeof removeOnly>, string]> = [
      [removeOnly([0], '999'), 'note-type-missing'],
      [removeOnly([7]), 'template-missing'],
      [removeOnly([0, 1, 2]), 'last-template'],
    ];
    for (const [changes, code] of cases) {
      const db = threeTemplateDb();
      const before = cardCount(db);
      let seen = '';
      try {
        applyExportChanges(db, changes, { nowMs: NOW_MS, normalize: stripFieldHtml });
      } catch (err) {
        expect(err).toBeInstanceOf(ExportRefusal);
        seen = (err as ExportRefusal).code;
      }
      expect(seen).toBe(code);
      // Refused before write #1: nothing was deleted on the way to the refusal.
      expect(cardCount(db)).toBe(before);
    }
  });

  it('refuses a package that stores no note-type list at all', () => {
    const db = threeTemplateDb();
    db.run('UPDATE col SET models = ?', ['']);
    let seen = '';
    try {
      applyExportChanges(db, removeOnly([1]), { nowMs: NOW_MS, normalize: stripFieldHtml });
    } catch (err) {
      seen = (err as ExportRefusal).code;
    }
    expect(seen).toBe('template-storage-unsupported');
    expect(cardCount(db)).toBe(6);
  });
});

describe('applyExportChanges — recipe 17 template removal (schema 18 tables)', () => {
  it('writes through the templates table without touching the notetype protobuf', () => {
    const db = normalizedTemplateDb();
    const configBefore = db.exec('SELECT config FROM notetypes WHERE id = 100')[0]?.values[0][0];
    const result = applyExportChanges(db, removeOnly([1]), {
      nowMs: NOW_MS,
      normalize: stripFieldHtml,
    });
    expect(result.templatesRemoved).toBe(1);
    expect(result.cardsDeleted).toBe(1);

    expect(
      db.exec('SELECT ord, name FROM templates WHERE ntid = 100 ORDER BY ord')[0]?.values,
    ).toEqual([
      [0, 'Card 1'],
      [1, 'Card 2'],
    ]);
    expect(cardOrds(db)).toEqual([0, 1]);
    // The blob is byte-identical: schema 18 keeps the list out of the protobuf.
    expect(db.exec('SELECT config FROM notetypes WHERE id = 100')[0]?.values[0][0]).toEqual(
      configBefore,
    );
    // Freshness did move, so Anki re-syncs the note type.
    expect(db.exec('SELECT mtime_secs, usn FROM notetypes WHERE id = 100')[0]?.values[0]).toEqual([
      Math.floor(NOW_MS / 1000),
      -1,
    ]);
  });

  it('refuses to empty the note type here too', () => {
    const db = normalizedTemplateDb();
    let seen = '';
    try {
      applyExportChanges(db, removeOnly([0, 1, 2]), { nowMs: NOW_MS, normalize: stripFieldHtml });
    } catch (err) {
      seen = (err as ExportRefusal).code;
    }
    expect(seen).toBe('last-template');
    expect(db.exec('SELECT COUNT(*) FROM templates')[0]?.values[0][0]).toBe(3);
  });
});

/**
 * Acceptance gate 5's flags, suspension and interval/ease, written into a real
 * collection and read back out of it. The round trip is the claim here as
 * everywhere in this file — the `UPDATE` is never trusted, only the re-read.
 */
describe('applyExportChanges — gate 5 card state', () => {
  const NONE = { notes: [], cardMoves: [], deckRenames: [] };

  /** A second card on the fixture, in a state each capability can be tested on. */
  function withReviewCard(db: Database): void {
    db.run(
      'INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags) '
        + 'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [5002, 1002, 1, 0, 1_500_000_100, 0, 2, 2, 300, 10, 2300, 4, 1, 0, 0, 0, 0b1011_0000],
    );
  }

  it('sets a flag without touching the reserved bits of the column', () => {
    // `cards.flags` packs the colour into its low three bits. The fixture card
    // carries 0b1011_0000, so a writer that assigned a bare 0-7 would clear
    // four bits nothing in this app has ever read.
    const db = fixtureDb();
    withReviewCard(db);
    const result = applyExportChanges(
      db,
      { ...NONE, cardFlags: [{ cardId: '5002', noteId: '1002', flag: 'purple' }] },
      { nowMs: NOW_MS, normalize: stripFieldHtml },
    );
    expect(result.cardsUpdated).toBe(1);
    const stored = Number(db.exec('SELECT flags FROM cards WHERE id = 5002')[0]!.values[0][0]);
    expect(stored & 0b111).toBe(7); // purple
    expect(stored & ~0b111).toBe(0b1011_0000);
  });

  it('suspends and unsuspends by writing the queue the change set names', () => {
    const db = fixtureDb();
    withReviewCard(db);
    applyExportChanges(
      db,
      { ...NONE, cardQueues: [{ cardId: '5002', noteId: '1002', queue: 'suspended' }] },
      { nowMs: NOW_MS, normalize: stripFieldHtml },
    );
    expect(Number(db.exec('SELECT queue FROM cards WHERE id = 5002')[0]!.values[0][0])).toBe(-1);
    applyExportChanges(
      db,
      { ...NONE, cardQueues: [{ cardId: '5002', noteId: '1002', queue: 'review' }] },
      { nowMs: NOW_MS, normalize: stripFieldHtml },
    );
    expect(Number(db.exec('SELECT queue FROM cards WHERE id = 5002')[0]!.values[0][0])).toBe(2);
    // …and the card's own type is untouched: suspension is a queue state, and
    // rewriting `type` alongside it would be a scheduling change in disguise.
    expect(Number(db.exec('SELECT type FROM cards WHERE id = 5002')[0]!.values[0][0])).toBe(2);
  });

  it('writes interval and ease together and leaves the counters alone', () => {
    const db = fixtureDb();
    withReviewCard(db);
    applyExportChanges(
      db,
      {
        ...NONE,
        cardScheduling: [{ cardId: '5002', noteId: '1002', interval: 45, easeFactor: 2600 }],
      },
      { nowMs: NOW_MS, normalize: stripFieldHtml },
    );
    const row = db.exec('SELECT ivl, factor, reps, lapses FROM cards WHERE id = 5002')[0]!.values[0];
    expect([Number(row[0]), Number(row[1])]).toEqual([45, 2600]);
    // The read-only half of the old scheduling row, unchanged — the revlog still
    // holds a row per review and a rewritten counter would contradict it.
    expect([Number(row[2]), Number(row[3])]).toEqual([4, 1]);
  });

  it('counts one card once when two capabilities name it', () => {
    const db = fixtureDb();
    withReviewCard(db);
    const result = applyExportChanges(
      db,
      {
        ...NONE,
        cardFlags: [{ cardId: '5002', noteId: '1002', flag: 'red' }],
        cardQueues: [{ cardId: '5002', noteId: '1002', queue: 'suspended' }],
        cardScheduling: [{ cardId: '5002', noteId: '1002', interval: 45, easeFactor: 2600 }],
      },
      { nowMs: NOW_MS, normalize: stripFieldHtml },
    );
    expect(result.cardsUpdated).toBe(1);
  });

  it('refuses a card the package does not hold, before writing anything', () => {
    const db = fixtureDb();
    withReviewCard(db);
    let seen = '';
    try {
      applyExportChanges(
        db,
        {
          ...NONE,
          cardFlags: [{ cardId: '5002', noteId: '1002', flag: 'red' }],
          cardQueues: [{ cardId: '9999', noteId: '1002', queue: 'suspended' }],
        },
        { nowMs: NOW_MS, normalize: stripFieldHtml },
      );
    } catch (err) {
      seen = (err as ExportRefusal).code;
    }
    expect(seen).toBe('card-missing');
    // The flag that rode beside it must not have landed: all-or-nothing is the
    // whole contract of validating before the first UPDATE.
    expect(Number(db.exec('SELECT flags FROM cards WHERE id = 5002')[0]!.values[0][0])).toBe(0b1011_0000);
  });

  it('verifies all three out of the written collection, and fails when one did not land', () => {
    const db = fixtureDb();
    withReviewCard(db);
    const changes = {
      ...NONE,
      cardFlags: [{ cardId: '5002', noteId: '1002', flag: 'green' as const }],
      cardQueues: [{ cardId: '5002', noteId: '1002', queue: 'suspended' as const }],
      cardScheduling: [{ cardId: '5002', noteId: '1002', interval: 45, easeFactor: 2600 }],
    };
    applyExportChanges(db, changes, { nowMs: NOW_MS, normalize: stripFieldHtml });
    expect(verifyExportChanges(db, changes)).toEqual({ ok: true, mismatches: [] });

    // NEGATIVE CONTROL: undo one column behind the verifier's back. A verifier
    // that only re-stated the change set would still say ok.
    db.run('UPDATE cards SET factor = 2300 WHERE id = 5002');
    const verdict = verifyExportChanges(db, changes);
    expect(verdict.ok).toBe(false);
    expect(verdict.mismatches).toEqual(['card 5002: ease differs']);
  });
});

/**
 * Gate 5's whole pipeline in one test — the seam the two suites either side of
 * it do not cross. `ankiCardStateTray` stops at the journal; the cases above
 * start at a hand-written change set. Between them sits
 * `buildApkgExportChanges`, and a `cardFlags` array it forgot to fold is
 * exactly the shape of the defect `67512897` was written to fix: three
 * capabilities that were unwritable while every unit test either side stayed
 * green. So this runs one queued action all the way to stored columns and
 * reads them back through the reader an import would use.
 */
describe('gate 5 end to end: tray action → change set → package → re-read', () => {
  /** The subject: a graduated review card carrying reserved bits in `flags`. */
  function withReviewCard(db: Database): void {
    db.run(
      'INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags) '
        + 'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [5002, 1002, 1, 0, 1_500_000_100, 0, 2, 2, 300, 10, 2300, 4, 1, 0, 0, 0, 0b1011_0000],
    );
  }

  /** A second review card, on its own note, deliberately left out of the selection. */
  function withControlCard(db: Database): void {
    db.run(
      'INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [1003, 'guid-c', 100, 1_500_000_100, 0, '', ['犬', 'いぬ'].join(SEP), 'いぬ', 0, 0, ''],
    );
    db.run(
      'INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags) '
        + 'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [5003, 1003, 1, 0, 1_500_000_100, 0, 2, 2, 300, 10, 2300, 4, 1, 0, 0, 0, 0],
    );
  }

  const draftOf = (db: Database): AnkiDraft =>
    buildAnkiDraft(readRawCollection(db), {
      source: { kind: 'apkg', label: 'fixture.apkg', createdAtSec: 1_500_000_000 },
      normalize: stripFieldHtml,
    });

  const cardIn = (draft: AnkiDraft, id: string) => {
    const card = draft.cards.find((c) => c.id === id);
    if (!card) throw new Error(`no card ${id} in draft`);
    return [card.flag, card.queue, card.interval, card.easeFactor];
  };

  it('writes flag, suspension and interval/ease from one queued action', () => {
    const db = fixtureDb();
    withReviewCard(db);
    withControlCard(db);
    const before = draftOf(db);
    expect(cardIn(before, '5002')).toEqual(['none', 'review', 10, 2300]);

    const plan = planChangeTray(before, createEditJournal(), ['1002'], [
      {
        id: 'g5',
        kind: 'set-card-state',
        enabled: true,
        flag: 'orange',
        suspended: true,
        scheduling: { interval: 42, easeFactor: 1900 },
      },
    ]);
    expect(plan.blocked).toBe(false);
    expect(plan.changedCards).toBe(1);

    // The half neither neighbouring suite exercises: the journal folded into a
    // change set. All three arrays have to be there or the write is a no-op.
    const changes = buildApkgExportChanges(plan.draft, plan.journal);
    expect(exportChangesEmpty(changes)).toBe(false);
    expect([
      changes.cardFlags?.length ?? 0,
      changes.cardQueues?.length ?? 0,
      changes.cardScheduling?.length ?? 0,
    ]).toEqual([1, 1, 1]);

    const result = applyExportChanges(db, changes, { nowMs: NOW_MS, normalize: stripFieldHtml });
    expect(result.cardsUpdated).toBe(1);

    // The claim is the re-read, never the UPDATE.
    const after = draftOf(db);
    expect(cardIn(after, '5002')).toEqual(['orange', 'suspended', 42, 1900]);
    // The reserved bits the flag column carries are still there — the same
    // guard as above, but now through the tray rather than a literal change set.
    expect(Number(db.exec('SELECT flags FROM cards WHERE id = 5002')[0]!.values[0][0]) & ~0b111)
      .toBe(0b1011_0000);
  });

  it('NEGATIVE CONTROL: a card outside the selection comes out untouched on all four columns', () => {
    const db = fixtureDb();
    withReviewCard(db);
    withControlCard(db);
    const before = draftOf(db);
    expect(cardIn(before, '5003')).toEqual(['none', 'review', 10, 2300]);

    const plan = planChangeTray(before, createEditJournal(), ['1002'], [
      {
        id: 'g5',
        kind: 'set-card-state',
        enabled: true,
        flag: 'orange',
        suspended: true,
        scheduling: { interval: 42, easeFactor: 1900 },
      },
    ]);
    applyExportChanges(db, buildApkgExportChanges(plan.draft, plan.journal), {
      nowMs: NOW_MS,
      normalize: stripFieldHtml,
    });

    const after = draftOf(db);
    expect(cardIn(after, '5003')).toEqual(['none', 'review', 10, 2300]);
    // `mod` too: a batch that rewrote every row would still pass the four
    // columns above while telling Anki's sync that every card changed.
    expect(Number(db.exec('SELECT mod FROM cards WHERE id = 5003')[0]!.values[0][0]))
      .toBe(1_500_000_100);
    expect(after.cards).toHaveLength(before.cards.length);
  });

  it('refuses an empty action and an out-of-range ease before any change set exists', () => {
    const db = fixtureDb();
    withReviewCard(db);
    const draft = draftOf(db);

    const empty = planChangeTray(draft, createEditJournal(), ['1002'], [
      { id: 'e', kind: 'set-card-state', enabled: true },
    ]);
    expect(empty.blocked).toBe(true);
    expect(empty.problems.map((p) => p.code)).toEqual(['card-state-empty']);
    expect(exportChangesEmpty(buildApkgExportChanges(empty.draft, empty.journal))).toBe(true);

    const clamped = planChangeTray(draft, createEditJournal(), ['1002'], [
      { id: 'c', kind: 'set-card-state', enabled: true, scheduling: { interval: 42, easeFactor: 900 } },
    ]);
    expect(clamped.blocked).toBe(true);
    expect(clamped.problems.map((p) => p.code)).toEqual(['card-state-invalid']);
    // Refused, not clamped to MIN_EASE_FACTOR: the stored ease is untouched.
    expect(Number(db.exec('SELECT factor FROM cards WHERE id = 5002')[0]!.values[0][0])).toBe(2300);
  });
});

// ----- the card designer's destination ------------------------------------------
//
// Gate 14 found `template-add` read-only on both destinations: `applyCardDesign`
// returned a new draft and never touched the journal, and the journal is all
// `buildApkgExportChanges` folds — so gate 13 added 3,180 cards to a real deck
// and not one of them could be exported. These cover the writer half of the fix.
// Every claim is read back out of the collection, never off the return value.

function addOnly(over: Partial<ApkgExportTemplateAdd> = {}): ApkgExportChangeSet {
  return {
    notes: [],
    cardMoves: [],
    deckRenames: [],
    templateAdds: [
      {
        noteTypeId: '100',
        ord: 3,
        name: 'Reverse',
        qfmt: '{{Reading}}',
        afmt: '{{FrontSide}}<hr id=answer>{{Expression}}',
        bqfmt: '',
        bafmt: '',
        cards: [{ noteId: '1001', deckId: '1', due: 0 }],
        ...over,
      },
    ],
  };
}

describe('the card designer writes into a package', () => {
  it('schema 18: inserts the template row and one card, and the config decodes back', () => {
    const db = normalizedTemplateDb();
    const changes = addOnly();
    const result = applyExportChanges(db, changes, { nowMs: NOW_MS, normalize: stripFieldHtml });
    expect(result.templatesAdded).toBe(1);
    expect(result.cardsCreated).toBe(1);
    // Not counted as an update: a created row is not an edited one.
    expect(result.cardsUpdated).toBe(0);

    // Read back, never off the result. Four templates now, the new one last.
    const templates = db.exec('SELECT ord, name FROM templates WHERE ntid = 100 ORDER BY ord')[0]!
      .values;
    expect(templates.map((r) => [Number(r[0]), String(r[1])])).toEqual([
      [0, 'Card 1'],
      [1, 'Card 1 copy'],
      [2, 'Card 2'],
      [3, 'Reverse'],
    ]);
    // The formats survive the protobuf round trip — the encoder is new, so this
    // is the assertion that it and `decodeTemplateConfig` agree.
    const config = db.exec('SELECT config FROM templates WHERE ntid = 100 AND ord = 3')[0]!
      .values[0][0];
    expect(decodeTemplateConfig(config)).toEqual({
      qfmt: '{{Reading}}',
      afmt: '{{FrontSide}}<hr id=answer>{{Expression}}',
      bqfmt: undefined,
      bafmt: undefined,
    });
    expect(cardOrds(db)).toEqual([0, 1, 2, 3]);
    // The note type's freshness moved with it, as the removal path does.
    expect(db.exec('SELECT mtime_secs, usn FROM notetypes WHERE id = 100')[0]!.values[0]).toEqual([
      Math.floor(NOW_MS / 1000),
      -1,
    ]);
    expect(verifyExportChanges(db, changes)).toEqual({ ok: true, mismatches: [] });
  });

  it('mints a card id past the collection own maximum, not off the clock', () => {
    // Two designs in one export would collide on a millisecond-derived id, and
    // an id already in `cards` would fail the primary key outright.
    const db = normalizedTemplateDb();
    const before = Number(db.exec('SELECT MAX(id) FROM cards')[0]!.values[0][0]);
    applyExportChanges(db, addOnly(), { nowMs: NOW_MS, normalize: stripFieldHtml });
    const created = db.exec(
      'SELECT id, nid, did, ord, type, queue, ivl, factor, data FROM cards WHERE ord = 3',
    )[0]!.values[0];
    expect(Number(created[0])).toBe(before + 1);
    expect([Number(created[1]), Number(created[2]), Number(created[3])]).toEqual([1001, 1, 3]);
    // A brand-new card's own zero state, and `data` is `{}` — an empty string
    // there makes newer Anki builds throw on open.
    expect([Number(created[4]), Number(created[5]), Number(created[6]), Number(created[7])]).toEqual(
      [0, 0, 0, 0],
    );
    expect(String(created[8])).toBe('{}');
  });

  it('schema 11: appends to col.models with the legacy keys', () => {
    const db = fixtureDb();
    const changes = addOnly({ ord: 1 });
    const result = applyExportChanges(db, changes, { nowMs: NOW_MS, normalize: stripFieldHtml });
    expect(result.templatesAdded).toBe(1);
    expect(result.cardsCreated).toBe(1);
    const models = JSON.parse(String(db.exec('SELECT models FROM col')[0]!.values[0][0])) as Record<
      string,
      { tmpls: Array<Record<string, unknown>> }
    >;
    expect(models['100'].tmpls.map((t) => t.ord)).toEqual([0, 1]);
    expect(models['100'].tmpls[1]).toMatchObject({
      name: 'Reverse',
      ord: 1,
      qfmt: '{{Reading}}',
      did: null,
    });
    expect(verifyExportChanges(db, changes)).toEqual({ ok: true, mismatches: [] });
  });

  it('refuses a design that also adds a FIELD, by name and before any write', () => {
    const db = normalizedTemplateDb();
    const templatesBefore = db.exec('SELECT COUNT(*) FROM templates')[0]!.values[0][0];
    let code = '';
    try {
      applyExportChanges(db, addOnly({ addedFieldName: 'Add Reverse' }), {
        nowMs: NOW_MS,
        normalize: stripFieldHtml,
      });
    } catch (err) {
      code = err instanceof ExportRefusal ? err.code : 'not-a-refusal';
    }
    expect(code).toBe('template-field-unsupported');
    // The negative control the refusal is worth nothing without: nothing landed.
    expect(db.exec('SELECT COUNT(*) FROM templates')[0]!.values[0][0]).toEqual(templatesBefore);
    expect(cardOrds(db)).toEqual([0, 1, 2]);
  });

  it('refuses an ord the source note type already holds', () => {
    const db = normalizedTemplateDb();
    expect(() =>
      applyExportChanges(db, addOnly({ ord: 2 }), { nowMs: NOW_MS, normalize: stripFieldHtml }),
    ).toThrow(ExportRefusal);
    expect(cardOrds(db)).toEqual([0, 1, 2]);
  });

  it('refuses a note the source package does not hold', () => {
    const db = normalizedTemplateDb();
    let code = '';
    try {
      applyExportChanges(db, addOnly({ cards: [{ noteId: '9999', deckId: '1', due: 0 }] }), {
        nowMs: NOW_MS,
        normalize: stripFieldHtml,
      });
    } catch (err) {
      code = err instanceof ExportRefusal ? err.code : 'not-a-refusal';
    }
    expect(code).toBe('note-missing');
    expect(cardOrds(db)).toEqual([0, 1, 2]);
  });

  it('verification fails when the card row is missing, and when there are two', () => {
    // The read-back is only worth something if it can fail. Both directions:
    // no card at the new ord, and the duplicate a writer run twice would leave.
    const db = normalizedTemplateDb();
    const changes = addOnly();
    applyExportChanges(db, changes, { nowMs: NOW_MS, normalize: stripFieldHtml });
    db.run('DELETE FROM cards WHERE ord = 3');
    expect(verifyExportChanges(db, changes).mismatches).toEqual([
      'note 1001: 0 cards at template 3, expected 1',
    ]);

    const twice = normalizedTemplateDb();
    applyExportChanges(twice, changes, { nowMs: NOW_MS, normalize: stripFieldHtml });
    twice.run(
      'INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, '
        + 'lapses, left, odue, odid, flags) VALUES (9999,1001,1,3,0,0,0,0,0,0,0,0,0,0,0,0,0)',
    );
    expect(verifyExportChanges(twice, changes).mismatches).toEqual([
      'note 1001: 2 cards at template 3, expected 1',
    ]);
  });

  it('a design-only change set is not `nothing-to-export`', () => {
    expect(exportChangesEmpty(addOnly())).toBe(false);
  });

  /**
   * Found live, through `anki:exportCsvDraft` with `{ notes: [] }`: two of the
   * nine fields were read strictly while seven were read tolerantly, so a
   * partial payload came back as `TypeError: Cannot read properties of
   * undefined (reading 'length')` instead of the `nothing-to-export` refusal
   * this guard exists to produce. All three destinations share the guard.
   */
  it('reads a partial IPC payload as empty rather than throwing on it', () => {
    const partial = (over: Record<string, unknown>) =>
      exportChangesEmpty(over as unknown as Parameters<typeof exportChangesEmpty>[0]);

    expect(partial({ notes: [] })).toBe(true);
    expect(partial({ cardMoves: [] })).toBe(true);
    expect(partial({})).toBe(true);
    // The control that keeps the line above from being vacuous: tolerance must
    // not swallow a field that IS carrying work.
    expect(partial({ notes: [{ noteId: '1001', fields: ['a'] }] })).toBe(false);
    expect(partial({ cardMoves: [{ noteId: '1001', cardId: '5001', due: 3 }] })).toBe(false);
  });

  // ----- Anki's own `unicase` collation ------------------------------------
  //
  // The live run on the user's real 2,991-note ver-18 package is what put these
  // here: `INSERT INTO templates` threw "no such collation sequence: unicase",
  // because schema 18 declares `templates.name COLLATE unicase` and puts a
  // UNIQUE index over `(name, ntid)` that the insert has to maintain. Every
  // package current Anki writes is shaped that way, so refusing would have made
  // the designer unusable on real data.
  //
  // sql.js rejects the collation in a CREATE TABLE, so — exactly as the deck
  // fixture above does — a real package can only ever arrive with it already in
  // the stored schema, and the fixture puts it there through `writable_schema`.
  function unicaseTemplateDb(): Database {
    const db = normalizedTemplateDb();
    // The index is what makes the collation load-bearing: a `COLLATE unicase`
    // column with nothing comparing it inserts fine. Real ver-18 packages carry
    // `CREATE UNIQUE INDEX idx_templates_name_ntid ON templates (name, ntid)`,
    // and the collation it uses comes from the COLUMN, not from this DDL — which
    // is why the index is created first, while the column is still plain.
    db.run('CREATE UNIQUE INDEX idx_templates_name_ntid ON templates (name, ntid)');
    db.run('PRAGMA writable_schema = ON');
    db.run(
      "UPDATE sqlite_master SET sql = replace(sql, 'name text', 'name text COLLATE unicase') "
        + "WHERE type = 'table' AND name = 'templates'",
    );
    db.run('PRAGMA writable_schema = RESET');
    return db;
  }
  const templateDdl = (db: Database): string =>
    String(
      db.exec("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'templates'")[0]!
        .values[0]![0],
    );

  it('writes into a package declaring `unicase`, and puts the schema back verbatim', () => {
    const db = unicaseTemplateDb();
    const before = templateDdl(db);
    // The control that makes the rest of this test mean something: without the
    // swap, this exact INSERT is impossible on this exact collection.
    expect(before).toMatch(/collate\s+unicase/i);
    expect(() =>
      db.run('INSERT INTO templates (ntid, ord, name, mtime_secs, usn, config) VALUES (100,9,?,0,0,?)', [
        'Direct',
        new Uint8Array(0),
      ]),
    ).toThrow(/no such collation sequence/i);

    const result = applyExportChanges(db, addOnly(), { nowMs: NOW_MS, normalize: stripFieldHtml });
    expect(result.templatesAdded).toBe(1);
    expect(result.cardsCreated).toBe(1);
    // Read back out of the collection, not off the result.
    expect(
      db.exec('SELECT name FROM templates WHERE ntid = 100 AND ord = 3')[0]!.values[0]![0],
    ).toBe('Reverse');
    // And the collection still declares the collation it arrived with, byte for
    // byte — a package that quietly lost `unicase` would be a different file
    // than the one Anki wrote.
    expect(templateDdl(db)).toBe(before);
  });

  it('restores the schema even when the write refuses partway', () => {
    // The `finally`, and the reason it is one: a refusal thrown between the swap
    // and the restore would otherwise leave the collection declaring BINARY.
    const db = unicaseTemplateDb();
    const before = templateDdl(db);
    const changes = addOnly();
    changes.templateAdds = [
      { ...changes.templateAdds![0]!, cards: [{ noteId: '9999', deckId: '1', due: 0 }] },
    ];
    expect(() =>
      applyExportChanges(db, changes, { nowMs: NOW_MS, normalize: stripFieldHtml }),
    ).toThrow();
    expect(templateDdl(db)).toBe(before);
    // All-or-nothing still holds: nothing was inserted.
    expect(db.exec('SELECT ord FROM templates WHERE ntid = 100 AND ord = 3')[0]).toBeUndefined();
  });

  it('refuses a name that collides only by case, which `unicase` would have caught', () => {
    // The uniqueness the swapped-out index can no longer enforce. `Card 2` is
    // already on this note type; `card 2` is the same name to Anki, and a
    // package carrying both would fail Anki's own check-database.
    const db = unicaseTemplateDb();
    try {
      applyExportChanges(db, addOnly({ name: 'card 2' }), {
        nowMs: NOW_MS,
        normalize: stripFieldHtml,
      });
      expect.unreachable('should have refused');
    } catch (err) {
      expect((err as ExportRefusal).code).toBe('template-name-taken');
    }
    expect(db.exec('SELECT ord FROM templates WHERE ntid = 100 AND ord = 3')[0]).toBeUndefined();

    // The control: a name that does not collide writes on the same collection.
    expect(
      applyExportChanges(db, addOnly({ name: 'Card 3' }), {
        nowMs: NOW_MS,
        normalize: stripFieldHtml,
      }).templatesAdded,
    ).toBe(1);
  });

  it('legacy `col.models` refuses the same collision, with no collation involved', () => {
    // The guard is on the NAME, not on the storage: the legacy blob has no index
    // and no collation, and Anki still treats the two names as one.
    const db = threeTemplateDb();
    try {
      applyExportChanges(db, addOnly({ noteTypeId: '100', ord: 3, name: 'CARD 2' }), {
        nowMs: NOW_MS,
        normalize: stripFieldHtml,
      });
      expect.unreachable('should have refused');
    } catch (err) {
      expect((err as ExportRefusal).code).toBe('template-name-taken');
    }
  });
});
