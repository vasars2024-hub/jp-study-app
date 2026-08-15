// Reads a real SQLite collection, built here in both of the schemas Anki ships,
// because the two disagree about where almost everything lives and a wrong table
// silently yields an empty deck rather than an error.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { Database, SqlJsStatic } from 'sql.js';
import { readRawCollection } from '../anki/apkgDraftRead';
import { buildAnkiDraft, ANKI_FIELD_SEP as SEP, draftIsBlocked } from '../../shared/ankiDraft';
import { stripFieldHtml } from '../../shared/apkgParse';

const nodeRequire = createRequire(import.meta.url);

let SQL: SqlJsStatic;

beforeAll(async () => {
  const initSqlJs = nodeRequire('sql.js') as (config?: {
    wasmBinary?: Uint8Array;
  }) => Promise<SqlJsStatic>;
  const wasmPath = nodeRequire.resolve('sql.js/dist/sql-wasm.wasm');
  SQL = await initSqlJs({ wasmBinary: fs.readFileSync(wasmPath) });
  expect(path.basename(wasmPath)).toBe('sql-wasm.wasm');
}, 30_000);

const NOTES_DDL = `
  CREATE TABLE notes (id integer primary key, guid text, mid integer, mod integer,
    usn integer, tags text, flds text, sfld text, csum integer, flags integer, data text);
  CREATE TABLE cards (id integer primary key, nid integer, did integer, ord integer,
    mod integer, usn integer, type integer, queue integer, due integer, ivl integer,
    factor integer, reps integer, lapses integer, left integer, odue integer,
    odid integer, flags integer, data text);
`;

/** A pre-schema-18 collection: note types and decks live in `col` JSON blobs. */
function legacyDb(): Database {
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE col (id integer primary key, crt integer, mod integer, scm integer,
      ver integer, dty integer, usn integer, ls integer, conf text, models text,
      decks text, dconf text, tags text);
    ${NOTES_DDL}
    CREATE TABLE revlog (id integer primary key, cid integer, usn integer, ease integer,
      ivl integer, lastIvl integer, factor integer, time integer, type integer);
  `);

  const models = {
    '100': {
      id: 100,
      name: 'Japanese',
      type: 0,
      css: '.card { color: #222; }',
      sortf: 0,
      latexPre: '\\documentclass',
      latexPost: '\\end{document}',
      flds: [
        { name: 'Expression', ord: 0, sticky: false, rtl: false, font: 'Arial', size: 20 },
        { name: 'Reading', ord: 1 },
        { name: 'English', ord: 2 },
      ],
      tmpls: [
        { name: 'Recognition', ord: 0, qfmt: '{{Expression}}', afmt: '{{English}}', bqfmt: '', bafmt: '', did: null },
        { name: 'Production', ord: 1, qfmt: '{{English}}', afmt: '{{Expression}}', bqfmt: '{{English}}', bafmt: '', did: 2 },
      ],
    },
  };
  const decks = {
    '1': { id: 1, name: 'Default', dyn: 0, conf: 1 },
    '2': { id: 2, name: 'Japanese::Core', dyn: 0, conf: 1 },
    '3': { id: 3, name: 'Custom Study', dyn: 1 },
  };
  db.run('INSERT INTO col (id, crt, mod, ver, models, decks) VALUES (1, ?, ?, 11, ?, ?)', [
    1_500_000_000,
    1_700_000_000_000,
    JSON.stringify(models),
    JSON.stringify(decks),
  ]);

  db.run(
    'INSERT INTO notes (id, guid, mid, mod, tags, flds, flags, data) VALUES (?,?,?,?,?,?,?,?)',
    [1001, 'guid-a', 100, 1_690_000_000, ' core marked ', ['食べる', 'たべる', '<b>to eat</b> <img src="e.png">'].join(SEP), 0, ''],
  );
  db.run(
    `INSERT INTO cards (id, nid, did, ord, mod, type, queue, due, ivl, factor, reps,
      lapses, left, odue, odid, flags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [5001, 1001, 2, 0, 1_690_000_000, 2, 2, 400, 21, 2500, 9, 1, 0, 0, 0, 3],
  );
  db.run(
    `INSERT INTO cards (id, nid, did, ord, mod, type, queue, due, ivl, factor, reps,
      lapses, left, odue, odid, flags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [5002, 1001, 3, 1, 1_690_000_000, 2, 2, 5, 3, 2300, 2, 0, 0, 402, 2, 0],
  );
  db.run(
    'INSERT INTO revlog (id, cid, ease, ivl, lastIvl, factor, time, type) VALUES (?,?,?,?,?,?,?,?)',
    [1_690_000_000_000, 5001, 3, 21, 10, 2500, 4200, 1],
  );
  return db;
}

/** `(field << 3) | 2`, a one-byte length, then UTF-8 — a real config blob's shape. */
function lenField(field: number, value: string): number[] {
  const utf8 = Array.from(new TextEncoder().encode(value));
  return [(field << 3) | 2, utf8.length, ...utf8];
}

const protoBytes = (...parts: number[][]) => Uint8Array.from(parts.flat());

/** Schema 18: normalized tables, and the formats hidden inside protobuf blobs. */
function normalizedDb(): Database {
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE col (id integer primary key, crt integer, mod integer, ver integer,
      models text, decks text);
    ${NOTES_DDL}
    CREATE TABLE notetypes (id integer primary key, name text, mtime_secs integer,
      usn integer, config blob);
    CREATE TABLE fields (ntid integer, ord integer, name text, config blob,
      primary key (ntid, ord));
    CREATE TABLE templates (ntid integer, ord integer, name text, mtime_secs integer,
      usn integer, config blob, primary key (ntid, ord));
    CREATE TABLE decks (id integer primary key, name text, mtime_secs integer,
      usn integer, common blob, kind blob);
  `);
  // A real schema-18 collection stores `col.models = ''`, not a blob.
  db.run('INSERT INTO col (id, crt, mod, ver, models, decks) VALUES (1, ?, ?, 18, ?, ?)', [
    1_500_000_000,
    1_700_000_000_000,
    '',
    '',
  ]);
  // Note type 100 keeps an empty template config: the case where the formats
  // genuinely cannot be read, which must stay blocking.
  db.run('INSERT INTO notetypes (id, name, config) VALUES (100, ?, ?)', ['Japanese', new Uint8Array([0x08, 0x00])]);
  db.run('INSERT INTO fields (ntid, ord, name, config) VALUES (100, 0, ?, ?)', ['Expression', new Uint8Array()]);
  db.run('INSERT INTO fields (ntid, ord, name, config) VALUES (100, 1, ?, ?)', ['English', new Uint8Array()]);
  db.run('INSERT INTO templates (ntid, ord, name, config) VALUES (100, 0, ?, ?)', ['Card 1', new Uint8Array()]);
  // Note type 200 carries the real protobuf blobs a modern export writes.
  db.run('INSERT INTO notetypes (id, name, config) VALUES (200, ?, ?)', [
    'Cloze+',
    protoBytes(lenField(3, '.card { color: #111; }'), lenField(5, '\\documentclass'), lenField(6, '\\end{document}')),
  ]);
  db.run('INSERT INTO fields (ntid, ord, name, config) VALUES (200, 0, ?, ?)', [
    'Text',
    protoBytes(lenField(3, 'Arial'), [0x20, 20]),
  ]);
  db.run('INSERT INTO templates (ntid, ord, name, config) VALUES (200, 0, ?, ?)', [
    'Cloze card',
    protoBytes(lenField(1, '{{cloze:Text}}'), lenField(2, '{{cloze:Text}}<br>{{Extra}}'), lenField(3, '{{Text}}')),
  ]);
  // The `kind` oneof: 0x0a keys field 1 (normal), 0x12 keys field 2 (filtered).
  db.run('INSERT INTO decks (id, name, kind) VALUES (1, ?, ?)', ['Japanese', new Uint8Array([0x0a, 0x00])]);
  db.run('INSERT INTO decks (id, name, kind) VALUES (2, ?, ?)', ['Japanese\x1fCore', new Uint8Array([0x12, 0x00])]);
  db.run(
    'INSERT INTO notes (id, guid, mid, mod, tags, flds, flags, data) VALUES (?,?,?,?,?,?,?,?)',
    [1001, 'guid-a', 100, 1_690_000_000, '', ['走る', 'to run'].join(SEP), 0, ''],
  );
  return db;
}

const source = { kind: 'apkg' as const, label: 'test.apkg', fingerprint: 'sha1:test' };
const draftOf = (db: Database, mediaFiles?: string[]) =>
  buildAnkiDraft(readRawCollection(db, { mediaFiles }), { source, normalize: stripFieldHtml });

describe('readRawCollection — legacy col.models/col.decks schema', () => {
  it('reads note types out of the JSON blob with formats intact', () => {
    const db = legacyDb();
    const [nt] = readRawCollection(db).noteTypes;
    expect(nt.name).toBe('Japanese');
    expect(nt.css).toBe('.card { color: #222; }');
    expect(nt.latexPre).toBe('\\documentclass');
    expect(nt.fields.map((f) => f.name)).toEqual(['Expression', 'Reading', 'English']);
    expect(nt.templates[0].qfmt).toBe('{{Expression}}');
    expect(nt.templates[1].did).toBe('2');
    expect(nt.templates[0].did).toBeNull();
    expect(nt.formatsUnavailable).toBeUndefined();
    db.close();
  });

  it('reads the deck blob including the filtered deck', () => {
    const db = legacyDb();
    const decks = readRawCollection(db).decks;
    expect(decks.map((d) => d.name)).toEqual(['Default', 'Japanese::Core', 'Custom Study']);
    expect(decks[2].dyn).toBe(1);
    db.close();
  });

  it('builds a draft that keeps everything the simplified importer drops', () => {
    const db = legacyDb();
    const draft = draftOf(db, ['e.png']);
    expect(draft.counts).toEqual({
      notes: 1, cards: 2, decks: 3, noteTypes: 1, reviews: 1, mediaReferences: 1,
    });
    const [note] = draft.notes;
    expect(note.guid).toBe('guid-a');
    expect(note.marked).toBe(true);
    expect(note.tags).toEqual(['core']);
    // The raw HTML survives; only the searchable copy is stripped.
    expect(note.fields[2].raw).toBe('<b>to eat</b> <img src="e.png">');
    expect(note.fields[2].normalized).toBe('to eat');
    expect(note.cardIds).toEqual(['5001', '5002']);
    expect(draft.cards[0].flag).toBe('green');
    expect(draft.cards[1].originalDeckId).toBe('2');
    expect(draft.cards[1].originalDue).toBe(402);
    expect(draft.reviews).toHaveLength(1);
    expect(draftIsBlocked(draft)).toBe(false);
    db.close();
  });

  it('reads scheduling that the card importer never looked at', () => {
    const db = legacyDb();
    expect(draftOf(db).cards[0]).toMatchObject({
      type: 'review', queue: 'review', due: 400, interval: 21, easeFactor: 2500, reps: 9, lapses: 1,
    });
    db.close();
  });

  it('reports media the package does not carry', () => {
    const db = legacyDb();
    const missing = draftOf(db, []).diagnostics.find((d) => d.code === 'missing-media');
    expect(missing).toMatchObject({ count: 1, samples: ['e.png'] });
    db.close();
  });
});

describe('readRawCollection — schema 18 normalized tables', () => {
  it('falls through the empty col.models to the notetypes tables', () => {
    const db = normalizedDb();
    const [nt] = readRawCollection(db).noteTypes;
    expect(nt.name).toBe('Japanese');
    expect(nt.fields.map((f) => f.name)).toEqual(['Expression', 'English']);
    expect(nt.templates.map((t) => t.name)).toEqual(['Card 1']);
    db.close();
  });

  it('refuses to pass off unreadable protobuf formats as empty ones', () => {
    const db = normalizedDb();
    const draft = draftOf(db);
    const found = draft.diagnostics.find((d) => d.code === 'template-format-unavailable');
    expect(found).toMatchObject({ severity: 'blocking', count: 1, samples: ['Japanese'] });
    expect(draftIsBlocked(draft)).toBe(true);
    db.close();
  });

  it('decodes CSS, LaTeX, formats and field fonts out of the protobuf blobs', () => {
    const db = normalizedDb();
    const nt = readRawCollection(db).noteTypes.find((n) => n.name === 'Cloze+');
    expect(nt).toMatchObject({
      css: '.card { color: #111; }',
      latexPre: '\\documentclass',
      latexPost: '\\end{document}',
      // Cloze is read from the template text, not from a guessed enum field.
      type: 1,
    });
    expect(nt?.fields[0]).toMatchObject({ name: 'Text', font: 'Arial', size: 20 });
    expect(nt?.templates[0]).toMatchObject({
      qfmt: '{{cloze:Text}}',
      afmt: '{{cloze:Text}}<br>{{Extra}}',
      bqfmt: '{{Text}}',
    });
    // Its formats are readable, so it raises no blocking diagnostic of its own.
    expect(nt?.formatsUnavailable).toBeUndefined();
    db.close();
  });

  it('keeps the blocking diagnostic per note type, not per collection', () => {
    const db = normalizedDb();
    // Give note type 100 a decodable template and the whole draft unblocks.
    db.run('UPDATE templates SET config = ? WHERE ntid = 100', [
      protoBytes(lenField(1, '{{Expression}}'), lenField(2, '{{English}}')),
    ]);
    const draft = draftOf(db);
    expect(draft.diagnostics.map((d) => d.code)).not.toContain('template-format-unavailable');
    expect(draftIsBlocked(draft)).toBe(false);
    db.close();
  });

  it('reads the filtered flag out of the kind blob oneof tag', () => {
    const db = normalizedDb();
    const decks = draftOf(db).decks;
    expect(decks[0].filtered).toBe(false);
    expect(decks[1].filtered).toBe(true);
    // 0x1f nesting is split the same as `::`.
    expect(decks[1].path).toEqual(['Japanese', 'Core']);
    expect(decks[1].parentId).toBe('1');
    db.close();
  });

  it('says the review history is absent rather than empty when there is no revlog', () => {
    const db = normalizedDb();
    const draft = draftOf(db);
    expect(draft.reviews).toBeUndefined();
    expect(draft.diagnostics.map((d) => d.code)).toContain('review-history-absent');
    db.close();
  });
});

describe('readRawCollection — degradation', () => {
  it('reads an empty revlog as empty, not as absent', () => {
    const db = legacyDb();
    db.run('DELETE FROM revlog');
    const draft = draftOf(db);
    expect(draft.reviews).toEqual([]);
    expect(draft.diagnostics.map((d) => d.code)).not.toContain('review-history-absent');
    db.close();
  });

  it('survives a collection with no note types at all', () => {
    const db = new SQL.Database();
    db.run(NOTES_DDL);
    const raw = readRawCollection(db);
    expect(raw.noteTypes).toEqual([]);
    expect(raw.decks).toEqual([]);
    expect(raw.col).toBeUndefined();
    db.close();
  });

  it('degrades a malformed models blob to the normalized tables rather than throwing', () => {
    const db = normalizedDb();
    db.run("UPDATE col SET models = '{not json'");
    expect(readRawCollection(db).noteTypes.map((n) => n.name)).toEqual(['Japanese', 'Cloze+']);
    db.close();
  });
});
