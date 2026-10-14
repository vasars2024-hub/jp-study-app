// .apkg import, the history half: each first card's review log (`revlog`) and
// the FSRS parameters of the deck options the cards were studied under, read
// from both collection schemas (schema 11's JSON, schema 18's protobuf blobs).
//
// Before: the importer read the current schedule only. A card with a year of
// answers arrived looking like it had none, and Anki's fitted FSRS parameters
// stayed behind.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import AdmZip from 'adm-zip';
import type { Database, SqlJsStatic } from 'sql.js';
import { readApkgCardsFile } from '../anki/apkgNoteRead';
import { decodeDeckConfigFsrs, decodeNormalDeckKind } from '../anki/ankiProtoConfig';
import { ankiRevlogToReviewEntries } from '../../shared/apkgCards';
import { DEFAULT_FSRS6_WEIGHTS, DEFAULT_FSRS_WEIGHTS } from '../../shared/fsrs';

const nodeRequire = createRequire(__filename);
const SEP = '\u001f';
const CRT = 1_600_000_000;
let SQL: SqlJsStatic;
let workDir: string;

beforeAll(async () => {
  const initSqlJs = nodeRequire('sql.js') as (config?: { wasmBinary?: Uint8Array }) => Promise<SqlJsStatic>;
  SQL = await initSqlJs({ wasmBinary: fs.readFileSync(nodeRequire.resolve('sql.js/dist/sql-wasm.wasm')) });
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-apkg-history-'));
}, 30_000);

afterAll(() => {
  if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
});

// ----- a tiny protobuf writer, for schema-18 blobs ------------------------------

function varint(n: number | bigint): number[] {
  let v = BigInt(n);
  const out: number[] = [];
  do {
    const byte = Number(v & 0x7fn);
    v >>= 7n;
    out.push(v > 0n ? byte | 0x80 : byte);
  } while (v > 0n);
  return out;
}
const key = (field: number, wire: number): number[] => varint((field << 3) | wire);
function f32(value: number): number[] {
  const buf = new DataView(new ArrayBuffer(4));
  buf.setFloat32(0, value, true);
  return [...new Uint8Array(buf.buffer)];
}
const packedFloats = (field: number, values: readonly number[]): number[] => {
  const body = values.flatMap(f32);
  return [...key(field, 2), ...varint(body.length), ...body];
};
const floatField = (field: number, value: number): number[] => [...key(field, 5), ...f32(value)];
const varintField = (field: number, value: number): number[] => [...key(field, 0), ...varint(value)];
const message = (field: number, body: number[]): number[] => [...key(field, 2), ...varint(body.length), ...body];

// ----- packages --------------------------------------------------------------------

const DAY = 86_400_000;
const T0 = Date.UTC(2025, 0, 10, 12);

/** A card's history: learn, learn, review x2, lapse, relearn, a Forget, learn again, review. */
const REVLOG: Array<[number, number, number, number, number, number, number]> = [
  // id (ms), ease, ivl, lastIvl, factor, time, type
  [T0, 1, -60, 0, 0, 8_000, 0],
  [T0 + 600_000, 3, 1, -60, 2500, 6_000, 0],
  [T0 + 1 * DAY, 3, 3, 1, 2500, 5_000, 1],
  [T0 + 4 * DAY, 1, -600, 3, 2300, 12_000, 1],
  [T0 + 4 * DAY + 600_000, 3, 1, -600, 2300, 4_000, 2],
  [T0 + 5 * DAY, 0, 7, 1, 2300, 0, 5], // rescheduled by FSRS: not an answer
  [T0 + 6 * DAY, 0, 0, 1, 0, 0, 4], // Forget: starts the card over
  [T0 + 6 * DAY + 1000, 4, 4, 0, 2500, 3_000, 0],
  [T0 + 10 * DAY, 2, 6, 4, 2500, 200_000, 1], // a long answer is capped
];

function baseSchema(db: Database, withRevlog: boolean): void {
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
  if (withRevlog) {
    db.run(`CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null,
      ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null,
      time integer not null, type integer not null)`);
  }
}

const MODELS = { '100': { id: 100, name: 'Japanese', flds: [{ name: 'Expression', ord: 0 }, { name: 'Meaning', ord: 1 }] } };

function addNotesAndCards(db: Database, deckId: number): void {
  db.run('INSERT INTO notes VALUES (1, "g1", 100, 0, 0, "", ?, "猫", 0, 0, "")', [`猫${SEP}cat`]);
  db.run('INSERT INTO notes VALUES (2, "g2", 100, 0, 0, "", ?, "犬", 0, 0, "")', [`犬${SEP}dog`]);
  // Note 1 has two cards: the history belongs to the first (id 11), not to 13.
  db.run('INSERT INTO cards VALUES (11, 1, ?, 0, 0, 0, 2, 2, 100, 6, 2500, 7, 1, 0, 0, 0, 0, "")', [deckId]);
  db.run('INSERT INTO cards VALUES (13, 1, ?, 1, 0, 0, 2, 2, 100, 6, 2500, 7, 1, 0, 0, 0, 0, "")', [deckId]);
  db.run('INSERT INTO cards VALUES (12, 2, ?, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, "")', [deckId]);
}

function addRevlog(db: Database): void {
  for (const row of REVLOG) db.run('INSERT INTO revlog VALUES (?, 11, 0, ?, ?, ?, ?, ?, ?)', [row[0], ...row.slice(1)]);
  db.run('INSERT INTO revlog VALUES (?, 13, 0, 3, 5, 2, 2500, 1000, 1)', [T0 + 2 * DAY]);
}

function pack(name: string, db: Database): string {
  const bytes = db.export();
  db.close();
  const zip = new AdmZip();
  zip.addFile('collection.anki2', Buffer.from(bytes));
  zip.addFile('media', Buffer.from('{}', 'utf8'));
  const filePath = path.join(workDir, name);
  zip.writeZip(filePath);
  return filePath;
}

/** Schema 11: decks and options presets as JSON in `col`. */
function schema11(name: string, dconf: Record<string, unknown>, options: { revlog?: boolean } = {}): string {
  const db = new SQL.Database();
  baseSchema(db, options.revlog !== false);
  db.run('INSERT INTO col (id, crt, mod, ver, models, decks, dconf) VALUES (1, ?, 0, 11, ?, ?, ?)', [
    CRT,
    JSON.stringify(MODELS),
    JSON.stringify({ '7': { id: 7, name: 'Core::N5', dyn: 0, conf: 3 }, '1': { id: 1, name: 'Default', dyn: 0, conf: 1 } }),
    JSON.stringify(dconf),
  ]);
  addNotesAndCards(db, 7);
  if (options.revlog !== false) addRevlog(db);
  return pack(name, db);
}

/** Schema 18: `decks.kind` and `deck_config.config` are protobuf blobs. */
function schema18(name: string, config: number[], deckKind: number[]): string {
  const db = new SQL.Database();
  baseSchema(db, true);
  db.run('CREATE TABLE decks (id integer primary key, name text, kind blob)');
  db.run('CREATE TABLE deck_config (id integer primary key, name text, mtime_secs integer, usn integer, config blob)');
  db.run('INSERT INTO col (id, crt, mod, ver, models, decks, dconf) VALUES (1, ?, 0, 18, ?, "", "")', [CRT, JSON.stringify(MODELS)]);
  db.run('INSERT INTO decks VALUES (7, ?, ?)', ['Japanese', new Uint8Array(deckKind)]);
  db.run('INSERT INTO deck_config VALUES (1, "Default", 0, 0, ?)', [new Uint8Array([])]);
  db.run('INSERT INTO deck_config VALUES (5, "Japanese FSRS", 0, 0, ?)', [new Uint8Array(config)]);
  addNotesAndCards(db, 7);
  addRevlog(db);
  return pack(name, db);
}

const NOW = (CRT + 200 * 86_400) * 1000;

describe('review history from revlog', () => {
  it('reads every answer of each note\'s first card, oldest first, and counts the answers', async () => {
    const res = await readApkgCardsFile(schema11('history.apkg', {}), { nowMs: NOW });
    expect(res.ok).toBe(true);
    const cat = res.cards?.find((card) => card.word === '猫');
    expect(cat?.ankiCardId).toBe(11);
    expect(cat?.history?.map((row) => row.id)).toEqual(REVLOG.map((row) => row[0]));
    expect(res.cards?.find((card) => card.word === '犬')?.history).toBeUndefined();
    // Seven answers: the FSRS reschedule and the Forget are not answers.
    expect(res.report?.historyReviews).toBe(7);
  });

  it('becomes review-log rows: answers only, a Forget starts the card over, ids stable', () => {
    const history = REVLOG.map(([id, ease, ivl, lastIvl, factor, time, type]) => ({ id, ease, ivl, lastIvl, factor, time, type }));
    const rows = ankiRevlogToReviewEntries(history, 11, 'gum-card', '猫');
    expect(rows.map((row) => row.rating)).toEqual(['again', 'good', 'good', 'again', 'good', 'easy', 'hard']);
    expect(rows.map((row) => row.isNew === true)).toEqual([true, false, false, false, false, true, false]);
    expect(rows[2]).toMatchObject({
      id: `anki-11-${T0 + DAY}`, at: T0 + DAY, mode: 'review', cardId: 'gum-card', word: '猫',
      correct: true, prevIntervalDays: 1, intervalDays: 3, durationMs: 5_000,
    });
    // A learning step's interval (negative seconds) is not a day interval.
    expect(rows[0]).toMatchObject({ prevIntervalDays: 0, intervalDays: 0 });
    expect(rows[6].durationMs).toBe(60_000);
    // The same deck imported again yields the same ids, so a merge adds nothing.
    expect(ankiRevlogToReviewEntries(history, 11, 'gum-card').map((row) => row.id)).toEqual(rows.map((row) => row.id));
  });

  it('a history whose start Anki pruned has no first review', () => {
    const rows = ankiRevlogToReviewEntries([{ id: T0, ease: 3, ivl: 10, lastIvl: 4, factor: 2500, time: 0, type: 1 }], 11, 'c');
    expect(rows[0].isNew).toBeUndefined();
  });

  it('a collection without a revlog table imports its cards with no history', async () => {
    const res = await readApkgCardsFile(schema11('no-revlog.apkg', {}, { revlog: false }), { nowMs: NOW });
    expect(res.ok).toBe(true);
    expect(res.cards?.every((card) => card.history === undefined)).toBe(true);
    expect(res.report?.historyReviews).toBe(0);
  });
});

describe('FSRS parameters from the deck options', () => {
  it('schema 11: the preset of the deck holding the cards, FSRS-6 preferred over FSRS-5', async () => {
    const params6 = [...DEFAULT_FSRS6_WEIGHTS.slice(0, 20), 0.2];
    const res = await readApkgCardsFile(schema11('dconf.apkg', {
      '1': { id: 1, name: 'Default', fsrsParams5: [...DEFAULT_FSRS_WEIGHTS] },
      '3': {
        id: 3,
        name: 'Japanese',
        fsrsWeights: [1, 2, 3],
        fsrsParams5: [...DEFAULT_FSRS_WEIGHTS],
        fsrsParams6: params6,
        desiredRetention: 0.88,
        rev: { maxIvl: 3650 },
      },
    }), { nowMs: NOW });
    expect(res.fsrs).toEqual({
      weights: params6,
      desiredRetention: 0.88,
      maximumIntervalDays: 3650,
      presetName: 'Japanese',
      deckName: 'Core::N5',
    });
  });

  it('schema 11: FSRS-5 parameters when that is all the preset has, nothing when it has none', async () => {
    const five = await readApkgCardsFile(schema11('dconf5.apkg', {
      '3': { id: 3, name: 'Old', fsrsParams5: [...DEFAULT_FSRS_WEIGHTS], fsrsParams6: [] },
    }), { nowMs: NOW });
    expect(five.fsrs?.weights).toEqual([...DEFAULT_FSRS_WEIGHTS]);
    const none = await readApkgCardsFile(schema11('dconf-none.apkg', { '3': { id: 3, name: 'SM-2 only' } }), { nowMs: NOW });
    expect(none.fsrs).toBeUndefined();
    const broken = await readApkgCardsFile(schema11('dconf-broken.apkg', {
      '3': { id: 3, name: 'Broken', fsrsParams6: [1, 2, 3], fsrsParams5: DEFAULT_FSRS_WEIGHTS.map(() => Number.NaN) },
    }), { nowMs: NOW });
    expect(broken.fsrs).toBeUndefined();
  });

  it('schema 18: decodes Deck.Normal.config_id and DeckConfig.Config fields 5, 6, 16 and 37', async () => {
    const params6 = [...DEFAULT_FSRS6_WEIGHTS];
    const config = [
      ...packedFloats(1, [1, 10]),
      ...packedFloats(5, DEFAULT_FSRS_WEIGHTS),
      ...packedFloats(6, params6),
      ...varintField(16, 1200),
      ...floatField(37, 0.92),
    ];
    // KindContainer { normal (1): Normal { config_id (1): 5, desired_retention (10): 0.85 } }
    const kind = message(1, [...varintField(1, 5), ...floatField(10, 0.85)]);
    const res = await readApkgCardsFile(schema18('schema18.apkg', config, kind), { nowMs: NOW });
    expect(res.ok).toBe(true);
    // The deck's own retention override wins over its preset's.
    expect(res.fsrs).toEqual({
      weights: params6,
      desiredRetention: 0.85,
      maximumIntervalDays: 1200,
      presetName: 'Japanese FSRS',
      deckName: 'Japanese',
    });
    expect(res.cards?.find((card) => card.word === '猫')?.history).toHaveLength(REVLOG.length);
  });

  it('the decoders read float32s at float32 precision and refuse what is not a blob', () => {
    const decoded = decodeDeckConfigFsrs(new Uint8Array([...packedFloats(6, [0.212, 1.2931]), ...floatField(37, 0.9)]));
    expect(decoded).toMatchObject({ params6: [0.212, 1.2931], params5: [], desiredRetention: 0.9 });
    expect(decodeDeckConfigFsrs('not a blob')).toBeNull();
    expect(decodeNormalDeckKind(new Uint8Array(message(2, [])))).toBeNull(); // a filtered deck
    expect(decodeNormalDeckKind(new Uint8Array(message(1, varintField(1, 9))))).toEqual({ configId: 9 });
  });
});
